'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, invokeErrorMessage } from '@/lib/api';
import { validatePassword, validateDisplayName, RateLimiter } from '@/lib/validation';
import { requestPrefsSync } from '@/lib/prefs-sync';

// ===== Types =====
export interface User {
  id: string;
  username: string;
  displayName: string;
  createdAt: number;
  lastLogin: number;
  isOnboarded: boolean;
  avatar?: string;
  biometricEnabled: boolean;
  securityTier: string;
  mfaEnabled: boolean;
}

export type AuthFlow = 'idle' | 'setup_account';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authFlow: AuthFlow;
  vaultLocked: boolean;
  unlockMethods: string[];
}

interface AuthContextType extends AuthState {
  createAccount: (username: string, displayName: string, masterPassword: string) => Promise<{ success: boolean; error?: string }>;
  logIn: (username: string, masterPassword: string) => Promise<{ success: boolean; error?: string }>;
  logOut: () => void;
  completeOnboarding: () => void;
  updateUser: (updates: Partial<User>) => void;
  setAuthFlow: (flow: AuthFlow) => void;
  unlockWithPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  unlockWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  unlockWithHello: (password: string) => Promise<{ success: boolean; error?: string }>;
  unlockWithSecurityKey: (keyId: string, password: string, pin?: string) => Promise<{ success: boolean; error?: string }>;
  refreshUnlockMethods: () => Promise<void>;
  lockVault: () => Promise<void>;
}

// ===== Rate Limiting =====
const authRateLimiter = new RateLimiter(5, 60000);

// ===== Context =====
const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ===== Provider =====
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    authFlow: 'idle',
    vaultLocked: false,
    unlockMethods: [],
  });

  // Check for existing account on mount
  useEffect(() => {
    (async () => {
      try {
        const mode = await api.getAuthScreenMode();
        setState(prev => ({
          ...prev,
          authFlow: mode === 'setup' ? 'setup_account' : 'idle',
        }));
      } catch {
        setState(prev => ({ ...prev, authFlow: 'setup_account' }));
      }
      setState(prev => ({ ...prev, isLoading: false }));
    })();
  }, []);

  // ===== Create Account =====
  const createAccount = useCallback(async (username: string, displayName: string, masterPassword: string) => {
    const trimmedUsername = username.trim();
    const trimmedName = displayName.trim();

    if (!trimmedUsername) {
      return { success: false, error: 'Username is required' };
    }

    if (!authRateLimiter.isAllowed(trimmedUsername)) {
      return { success: false, error: 'Too many attempts. Please try again in a minute.' };
    }

    const nameCheck = validateDisplayName(trimmedName);
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.errors.join(', ') };
    }

    const pwCheck = validatePassword(masterPassword);
    if (!pwCheck.isValid) {
      return { success: false, error: pwCheck.errors.join(', ') };
    }

    try {
      const user = await api.signUp(trimmedUsername, trimmedName, masterPassword);
      
      const localUser: User = {
        id: user.id,
        username: trimmedUsername,
        displayName: trimmedName,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        isOnboarded: user.is_onboarded,
        biometricEnabled: user.biometric_enabled,
        securityTier: user.security_tier,
        mfaEnabled: user.mfa_enabled,
      };

      setState({
        user: localUser,
        isAuthenticated: true,
        isLoading: false,
        authFlow: 'idle',
        vaultLocked: false,
        unlockMethods: ['password'],
      });
      requestPrefsSync();

      return { success: true };
    } catch (e) {
      return { success: false, error: invokeErrorMessage(e) };
    }
  }, []);

  // ===== Log In =====
  const logIn = useCallback(async (username: string, masterPassword: string) => {
    if (!username.trim() || !masterPassword) {
      return { success: false, error: 'Username and password are required' };
    }

    const trimmedUsername = username.trim();

    if (!authRateLimiter.isAllowed(trimmedUsername)) {
      return { success: false, error: 'Too many attempts. Please try again in a minute.' };
    }

    try {
      const unlockInfo = await api.getUnlockInfo();

      let user;
      if (unlockInfo.legacy) {
        user = await api.setupMasterPasswordFromLegacy(masterPassword);
      } else if (unlockInfo.methods.includes('password')) {
        user = await api.unlockWithPassword(masterPassword);
      } else {
        return { success: false, error: 'No password unlock method enrolled on this device.' };
      }
      
      const localUser: User = {
        id: user.id,
        username: trimmedUsername,
        displayName: user.display_name,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        isOnboarded: user.is_onboarded,
        biometricEnabled: user.biometric_enabled,
        securityTier: user.security_tier,
        mfaEnabled: user.mfa_enabled,
      };

      setState({
        user: localUser,
        isAuthenticated: true,
        isLoading: false,
        authFlow: 'idle',
        vaultLocked: false,
        unlockMethods: unlockInfo.methods.includes('password') ? unlockInfo.methods : ['password', ...unlockInfo.methods],
      });
      requestPrefsSync();

      return { success: true };
    } catch (e) {
      return { success: false, error: invokeErrorMessage(e) };
    }
  }, []);

  // ===== Vault Unlock (password / PIN / Hello) =====
  const finalizeUnlock = useCallback((u: import('@/lib/api').User) => {
    setState(prev => ({
      ...prev,
      user: prev.user ?? {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        createdAt: u.created_at,
        lastLogin: u.last_login,
        isOnboarded: u.is_onboarded,
        biometricEnabled: u.biometric_enabled,
        securityTier: u.security_tier,
        mfaEnabled: u.mfa_enabled,
      },
      vaultLocked: false,
    }));
    requestPrefsSync();
  }, []);

  const unlockWithPassword = useCallback(async (password: string) => {
    try {
      const u = await api.unlockWithPassword(password);
      finalizeUnlock(u);
      return { success: true };
    } catch (e) {
      return { success: false, error: invokeErrorMessage(e) };
    }
  }, [finalizeUnlock]);

  const unlockWithPin = useCallback(async (pin: string) => {
    try {
      const u = await api.unlockWithPin(pin);
      finalizeUnlock(u);
      return { success: true };
    } catch (e) {
      return { success: false, error: invokeErrorMessage(e) };
    }
  }, [finalizeUnlock]);

  const unlockWithHello = useCallback(async (password: string) => {
    try {
      const u = await api.unlockWithHello(password);
      finalizeUnlock(u);
      return { success: true };
    } catch (e) {
      return { success: false, error: invokeErrorMessage(e) };
    }
  }, [finalizeUnlock]);

  const unlockWithSecurityKey = useCallback(async (keyId: string, password: string, pin?: string) => {
    try {
      const u = await api.unlockWithSecurityKey(keyId, password, pin);
      finalizeUnlock(u);
      return { success: true };
    } catch (e) {
      return { success: false, error: invokeErrorMessage(e) };
    }
  }, [finalizeUnlock]);

  const refreshUnlockMethods = useCallback(async () => {
    try {
      const unlockInfo = await api.getUnlockInfo();
      setState(prev => ({
        ...prev,
        unlockMethods: unlockInfo.methods.includes('password')
          ? unlockInfo.methods
          : ['password', ...unlockInfo.methods],
      }));
    } catch { /* ignore */ }
  }, []);

  const lockVault = useCallback(async () => {
    await api.lockVault().catch(() => {});
    const { clearSecureClipboard } = await import('@/lib/secure-clipboard');
    await clearSecureClipboard().catch(() => {});
    setState(prev => ({ ...prev, vaultLocked: true }));
  }, []);

  // ===== Log Out =====
  const logOut = useCallback(async () => {
    api.logOut().catch(() => {});
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authFlow: 'idle',
      vaultLocked: false,
      unlockMethods: [],
    });
  }, []);

  // ===== Complete Onboarding =====
  const completeOnboarding = useCallback(() => {
    localStorage.setItem('gv_onboarded', 'true');
    api.completeOnboarding().catch(() => {});
    setState(prev => {
      if (!prev.user) return prev;
      return { ...prev, user: { ...prev.user, isOnboarded: true } };
    });
  }, []);

  // ===== Update User =====
  const updateUser = useCallback((updates: Partial<User>) => {
    api.updateUser(updates.displayName, updates.username).catch(() => {});
    setState(prev => {
      if (!prev.user) return prev;
      return { ...prev, user: { ...prev.user, ...updates } };
    });
  }, []);

  // ===== Set Auth Flow =====
  const setAuthFlow = useCallback((flow: AuthFlow) => {
    setState(prev => ({ ...prev, authFlow: flow }));
  }, []);

  // ===== Auto-Lock Enforcement =====
  const [lockSettings, setLockSettings] = useState<{ autoLock: boolean; timeoutMs: number } | null>(null);

  useEffect(() => {
    if (!state.isAuthenticated) {
      setLockSettings(null);
      return;
    }
    let active = true;
    api.getSettings()
      .then((s) => {
        if (!active) return;
        setLockSettings({
          autoLock: s.auto_lock,
          timeoutMs: Math.max(1, s.lock_timeout_mins) * 60000,
        });
      })
      .catch(() => { });
    return () => { active = false; };
  }, [state.isAuthenticated]);

  useEffect(() => {
    if (!state.isAuthenticated || state.vaultLocked || !lockSettings?.autoLock) return;

    const hasSecretMethods = state.unlockMethods.length > 0;

    let timer: ReturnType<typeof setTimeout>;
    const onTimeout = () => {
      if (hasSecretMethods) {
        lockVault().catch(() => {});
      } else {
        logOut();
      }
    };
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(onTimeout, lockSettings.timeoutMs);
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
      clearTimeout(timer);
    };
  }, [state.isAuthenticated, state.vaultLocked, state.unlockMethods, lockSettings, logOut, lockVault]);

  // Lock when app backgrounds (Android/home switch) — idle timer alone is not enough.
  useEffect(() => {
    if (!state.isAuthenticated || state.vaultLocked) return;

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        lockVault().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [state.isAuthenticated, state.vaultLocked, lockVault]);

  return (
    <AuthContext.Provider value={{
      ...state, createAccount, logIn, logOut,
      completeOnboarding, updateUser, setAuthFlow,
      unlockWithPassword, unlockWithPin, unlockWithHello, unlockWithSecurityKey,
      refreshUnlockMethods, lockVault,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
