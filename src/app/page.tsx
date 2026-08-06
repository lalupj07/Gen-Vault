'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import ParticleField from '@/components/ParticleField';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import Authenticator from '@/components/Authenticator';
import OnboardingFlow from '@/components/OnboardingFlow';
import WelcomeTour from '@/components/WelcomeTour';
import UnlockScreen from '@/components/UnlockScreen';
import OfflineAuthScreen from '@/components/OfflineAuthScreen';
import {
  VaultView, DevicesView, SessionsView, QROnboardView,
  HardwareKeysView, BiometricsView, ThreatDetectionView,
  RecoveryView, SettingsView, ProfileView
} from '@/components/SecondaryViews';
import FolderLockView from '@/components/FolderLockView';
import { defaultAppState, type AppState } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { api, type VaultEntry as ApiVaultEntry } from '@/lib/api';
import { CommandPalette } from '@/components/FeatureTools';
import { dispatchShortcut, PALETTE_ACTION_MAP, type ShortcutAction } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { COMPANY, PRODUCT } from '@/lib/company';
import { isWelcomeTourDone, markWelcomeTourDone, resetWelcomeTour } from '@/lib/welcomeTour';
import { isAndroidShell } from '@/lib/platform';
import MobileShell from '@/components/mobile/MobileShell';

export default function Home() {
  const router = useRouter();
  const { user, isAuthenticated, vaultLocked, isLoading: authLoading, logOut, completeOnboarding, lockVault } = useAuth();
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [welcomeTourOpen, setWelcomeTourOpen] = useState(false);
  const [appState, setAppState] = useState<AppState>(defaultAppState);
  const [vaultEntries, setVaultEntries] = useState<ApiVaultEntry[]>([]);
  const [androidShell, setAndroidShell] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsBootLoading(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    isAndroidShell().then(setAndroidShell).catch(() => setAndroidShell(false));
  }, []);

  // Load vault entries and security score from backend when authenticated & unlocked
  useEffect(() => {
    if (!isAuthenticated || vaultLocked) return;
    (async () => {
      try {
        const [entries, score] = await Promise.all([
          api.getVaultEntries(),
          api.getSecurityScore(),
        ]);
        setVaultEntries(entries);
        setAppState(prev => ({
          ...prev,
          securityScore: score,
          totalCredentials: entries.length,
          isOnboarded: true,
        }));
      } catch {
        // Backend not available yet, use defaults
      }
    })();
  }, [isAuthenticated, vaultLocked]);

  // Load stealth mode from backend
  useEffect(() => {
    if (!isAuthenticated || vaultLocked) return;
    api.getStealthMode().then(setStealthMode).catch(() => {});
  }, [isAuthenticated, vaultLocked]);

  // Welcome tour after onboarding (first visit to main app)
  useEffect(() => {
    if (!isAuthenticated || vaultLocked || !user?.isOnboarded) return;
    if (isWelcomeTourDone()) return;
    const timer = setTimeout(() => {
      setCollapsed(false);
      setActiveView('dashboard');
      setWelcomeTourOpen(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [isAuthenticated, vaultLocked, user?.isOnboarded]);

  // Global keyboard shortcuts
  useEffect(() => {
    if (!isAuthenticated || vaultLocked) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const map: Record<string, ShortcutAction> = {
        k: 'command-palette',
        n: 'add-entry',
        f: 'search-vault',
        i: 'import',
        e: 'export',
        l: 'lock-vault',
        ',': 'settings',
        t: 'templates',
      };
      if (e.shiftKey && key === 'f') {
        e.preventDefault();
        dispatchShortcut('favorites');
        return;
      }
      const action = map[key];
      if (!action) return;
      e.preventDefault();
      if (action === 'command-palette') {
        setPaletteOpen(true);
      } else if (action === 'lock-vault') {
        lockVault();
      } else if (action === 'settings') {
        setActiveView('settings');
      } else if (action === 'favorites') {
        setActiveView('authenticator');
        dispatchShortcut('favorites');
      } else {
        if (action === 'add-entry' || action === 'search-vault' || action === 'templates') {
          setActiveView('vault');
        }
        if (action === 'import' || action === 'export') {
          setActiveView('settings');
        }
        dispatchShortcut(action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAuthenticated, vaultLocked, lockVault]);

  const handlePaletteAction = (id: string) => {
    const action = PALETTE_ACTION_MAP[id];
    if (!action) {
      setActiveView(id);
      return;
    }
    if (action === 'lock-vault') {
      lockVault();
      return;
    }
    if (action === 'settings') {
      setActiveView('settings');
      return;
    }
    if (action === 'security-audit') {
      setActiveView('threat-detection');
      return;
    }
    if (action === 'emergency-codes') {
      setActiveView('recovery');
      return;
    }
    if (action === 'add-entry' || action === 'search-vault' || action === 'templates') {
      setActiveView('vault');
    }
    if (action === 'import' || action === 'export') {
      setActiveView('settings');
    }
    if (action === 'favorites') {
      setActiveView('authenticator');
    }
    dispatchShortcut(action);
  };

  const handleToggleStealth = async () => {
    const next = !stealthMode;
    setStealthMode(next);
    try { await api.setStealthMode(next); } catch { /* offline */ }
  };

  const handleOnboardComplete = () => {
    completeOnboarding();
  };

  const handleWelcomeTourComplete = () => {
    markWelcomeTourDone();
    setWelcomeTourOpen(false);
  };

  const handleReplayWelcomeTour = () => {
    resetWelcomeTour();
    setCollapsed(false);
    setActiveView('dashboard');
    setWelcomeTourOpen(true);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard appState={appState} vaultEntries={vaultEntries as any} />;
      case 'authenticator':
        return <Authenticator entries={vaultEntries as any} />;
      case 'vault':
        return <VaultView />;
      case 'folder-lock':
        return <FolderLockView />;
      case 'devices':
        return <DevicesView />;
      case 'sessions':
        return <SessionsView />;
      case 'qr-onboard':
        return <QROnboardView />;
      case 'hardware-keys':
        return <HardwareKeysView />;
      case 'biometrics':
        return <BiometricsView />;
      case 'threat-detection':
        return <ThreatDetectionView />;
      case 'recovery':
        return <RecoveryView />;
      case 'settings':
        return <SettingsView onReplayWelcomeTour={handleReplayWelcomeTour} />;
      case 'profile':
        return <ProfileView />;
      default:
        return <Dashboard appState={appState} vaultEntries={vaultEntries as any} />;
    }
  };

  // Boot loading screen
  if (isBootLoading || authLoading) {
    return (
      <div className="fixed inset-0 bg-vault-black flex flex-col items-center justify-center z-50">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="relative mb-8"
        >
          {/* Outer ring */}
          <motion.div
            className="w-24 h-24 rounded-full border-2 border-cyber-cyan/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />
          {/* Inner ring */}
          <motion.div
            className="absolute inset-2 rounded-full border-2 border-cyber-purple/30"
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
          {/* Core */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyber-cyan/20 to-cyber-purple/20 border border-cyber-cyan/30 flex items-center justify-center"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <svg className="w-5 h-5 text-cyber-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </motion.div>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl font-semibold text-vault-light tracking-tight mb-2"
        >
          GenVault
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xs text-vault-muted tracking-widest uppercase"
        >
          Initializing Secure Enclave...
        </motion.p>

        {/* Progress bar */}
        <motion.div
          className="w-48 h-0.5 bg-vault-border/30 rounded-full mt-6 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <motion.div
            className="h-full bg-gradient-to-r from-cyber-cyan to-cyber-purple rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
          />
        </motion.div>
      </div>
    );
  }

  // Auth gate - show offline setup/login screen
  if (!isAuthenticated) {
    if (authLoading) {
      return (
        <div className="fixed inset-0 bg-vault-black flex items-center justify-center">
          <motion.div
            className="w-8 h-8 border-2 border-cyber-cyan/30 border-t-cyber-cyan rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      );
    }
    
    // Show offline auth screen (setup or login)
    return <OfflineAuthScreen />;
  }

  // Onboarding (only for new users)
  if (user && !user.isOnboarded) {
    return <OnboardingFlow onComplete={handleOnboardComplete} />;
  }

  // Vault unlock screen (when authenticated but vault is locked)
  if (vaultLocked) {
    return <UnlockScreen />;
  }

  // Android phone shell — Figma layout patterns, GenVault dark tokens
  if (androidShell) {
    return <MobileShell />;
  }

  // Main Application (desktop)
  return (
    <div className="fixed inset-0 flex bg-vault-black overflow-hidden">
      <ParticleField />

      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        syncStatus={appState.syncStatus}
        securityScore={appState.securityScore}
        stealthMode={stealthMode}
        onToggleStealth={handleToggleStealth}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Top Bar */}
        <header data-tour="session-header" className="h-12 flex items-center justify-between px-6 border-b border-vault-border/30 glass-light flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-cyber-emerald animate-pulse" />
            <span className="text-xs text-vault-muted">
              Secure Session Active — Encrypted Channel Established
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono text-vault-muted/60">
              AES-256-GCM | Argon2id | TOTP
            </span>
            {user && (
              <span className="text-[10px] text-vault-muted">
                {user.displayName}
              </span>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyber-emerald/10 border border-cyber-emerald/20">
              <div className="w-1.5 h-1.5 rounded-full bg-cyber-emerald" />
              <span className="text-[10px] text-cyber-emerald font-medium">Protected</span>
            </div>
            <button
              onClick={logOut}
              className="text-[10px] px-2.5 py-1 rounded-full text-vault-muted hover:text-accent-danger bg-white/[0.02] border border-vault-border/30 hover:border-accent-danger/30 transition-all"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          <AnimatePresence initial={false}>
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                'min-h-full',
                stealthMode && 'blur-md brightness-75 pointer-events-none select-none'
              )}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>

          {stealthMode && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-vault-black/50">
              <div className="max-w-sm w-full rounded-2xl border border-cyber-purple/30 bg-vault-panel/95 backdrop-blur-xl p-8 text-center shadow-glow-md">
                <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-cyber-purple/10 border border-cyber-purple/30 flex items-center justify-center">
                  <svg className="w-7 h-7 text-cyber-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-vault-light">Stealth Mode Active</h2>
                <p className="text-sm text-vault-muted mt-2">
                  Vault content is hidden. Turn off stealth to view accounts, codes, and settings.
                </p>
                <button
                  type="button"
                  onClick={handleToggleStealth}
                  className="mt-6 w-full py-3 rounded-xl bg-cyber-purple/15 text-cyber-purple border border-cyber-purple/30 text-sm font-medium hover:bg-cyber-purple/25 transition-colors"
                >
                  Show Content
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Status Bar */}
        <footer className="h-7 flex items-center justify-between px-6 border-t border-vault-border/20 glass-light flex-shrink-0">
          <div className="flex items-center gap-4 text-[10px] text-vault-muted/50">
            <span>{PRODUCT.name} v{PRODUCT.version} (Build {PRODUCT.build})</span>
            <span>•</span>
            <span>{COMPANY.name}</span>
            <span>•</span>
            <span>{PRODUCT.tagline}</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-vault-muted/50">
            <span>TPM 2.0 Connected</span>
            <span>•</span>
            <span>Quantum-Ready</span>
            <span>•</span>
            <span className="text-cyber-emerald/60">All Systems Nominal</span>
          </div>
        </footer>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={setActiveView} onAction={handlePaletteAction} />
      <WelcomeTour
        open={welcomeTourOpen}
        onComplete={handleWelcomeTourComplete}
        onSkip={handleWelcomeTourComplete}
      />
    </div>
  );
}
