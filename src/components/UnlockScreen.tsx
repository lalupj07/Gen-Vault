'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Fingerprint, KeyRound, ArrowRight, AlertCircle, HardDrive, ChevronDown, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api, type HardwareSecurityKeyPublic, type GuestUnlockResult } from '@/lib/api';
import AccountRecoveryScreen from './AccountRecoveryScreen';

export default function UnlockScreen() {
  const {
    user, unlockMethods, unlockWithPassword, unlockWithHello,
    unlockWithSecurityKey, logOut, resetToSetup,
  } = useAuth();

  const hasPassword = unlockMethods.includes('password') || unlockMethods.length === 0;
  const hasHello = unlockMethods.includes('hello');
  const hasSecurityKey = unlockMethods.includes('security_key');

  const [hardwareKeys, setHardwareKeys] = useState<HardwareSecurityKeyPublic[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [keyPin, setKeyPin] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [showGuest, setShowGuest] = useState(false);
  const [guestGrantId, setGuestGrantId] = useState('');
  const [guestPassphrase, setGuestPassphrase] = useState('');
  const [showGuestPassphrase, setShowGuestPassphrase] = useState(false);
  const [guestSuccess, setGuestSuccess] = useState<GuestUnlockResult | null>(null);

  useEffect(() => {
    if (!hasSecurityKey) return;
    api.getHardwareKeys()
      .then((keys) => {
        setHardwareKeys(keys);
        if (keys.length === 1) setSelectedKeyId(keys[0].id);
      })
      .catch(() => setHardwareKeys([]));
  }, [hasSecurityKey]);

  if (showRecovery) {
    return (
      <AccountRecoveryScreen
        username={user?.username || ''}
        onBack={() => setShowRecovery(false)}
        onResetComplete={() => {
          setShowRecovery(false);
          setSecret('');
          setKeyPin('');
          setError('');
          resetToSetup();
        }}
      />
    );
  }

  const handleSecretUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const result = await unlockWithPassword(secret);
    if (!result.success) {
      setError(result.error || 'Unlock failed');
      setSecret('');
    }
    setIsLoading(false);
  };

  const handleHello = async () => {
    if (!secret) {
      setError('Enter your master password, then confirm with biometrics');
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await unlockWithHello(secret);
    if (!result.success) {
      setError(result.error || 'Biometric unlock failed');
      setSecret('');
    }
    setIsLoading(false);
  };

  const handleSecurityKey = async () => {
    if (!selectedKeyId) {
      setError('Select a security key');
      return;
    }
    if (!secret) {
      setError('Enter your master password, then touch your security key');
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await unlockWithSecurityKey(selectedKeyId, secret, keyPin || undefined);
    if (!result.success) {
      setError(result.error || 'Security key unlock failed');
      setSecret('');
    }
    setIsLoading(false);
  };

  const handleGuestUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setGuestSuccess(null);
    if (!guestGrantId.trim() || !guestPassphrase) {
      setError('Enter grant ID and passphrase');
      return;
    }
    setIsLoading(true);
    try {
      const result = await api.guestUnlock(guestGrantId.trim(), guestPassphrase);
      setGuestSuccess(result);
      setGuestPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest unlock failed');
      setGuestPassphrase('');
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-vault-black flex items-center justify-center px-4 m3-mobile-root">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="m3-glass p-6 sm:p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden border border-[color:var(--md-outline)] mb-4 bg-[color:var(--md-surface-container)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/genvault-icon.png" alt="" width={56} height={56} className="w-full h-full object-cover" />
            </div>
            <h1 className="m3-title-lg">Vault locked</h1>
            <p className="text-[color:var(--md-on-surface-variant)] text-sm mt-2">
              {user ? `Welcome back, ${user.displayName}` : 'Unlock to continue'}
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-xl bg-accent-danger/10 border border-accent-danger/20 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-accent-danger flex-shrink-0" />
              <p className="text-sm text-accent-danger">{error}</p>
            </motion.div>
          )}

          {hasPassword && (
            <form onSubmit={handleSecretUnlock} className="space-y-5">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Enter your master password"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  className="m3-field pl-10 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--md-on-surface-variant)]"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading || !secret}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-[var(--m3-radius-lg)] m3-fab !w-full !h-auto text-sm font-semibold disabled:opacity-50"
              >
                {isLoading ? (
                  <motion.div
                    className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                ) : (
                  <>Unlock <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          )}

          {hasHello && (
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={handleHello}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-outline)] text-sm font-semibold disabled:opacity-50"
              >
                <Fingerprint className="w-4 h-4" />
                Confirm with biometrics
              </button>
              <p className="text-[10px] text-center text-[color:var(--md-on-surface-variant)]">
                Requires master password above, then fingerprint / face / device PIN
              </p>
            </div>
          )}

          {hasSecurityKey && hardwareKeys.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full mt-4 flex items-center justify-center gap-1.5 text-sm text-[color:var(--md-on-surface-variant)] min-h-[44px]"
              >
                Security key options
                <ChevronDown className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-3 p-4 rounded-xl border border-[color:var(--md-outline)] bg-[color:var(--md-surface-container)]">
                      {hardwareKeys.length > 1 && (
                        <select
                          value={selectedKeyId}
                          onChange={(e) => setSelectedKeyId(e.target.value)}
                          className="m3-field text-sm"
                        >
                          <option value="">Select security key</option>
                          {hardwareKeys.map((k) => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="password"
                        value={keyPin}
                        onChange={(e) => setKeyPin(e.target.value)}
                        placeholder="Key PIN (if required)"
                        autoComplete="off"
                        className="m3-field text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleSecurityKey}
                        disabled={isLoading || !selectedKeyId}
                        className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-outline)] text-sm font-semibold disabled:opacity-50"
                      >
                        <HardDrive className="w-4 h-4" />
                        Unlock with Security Key
                      </button>
                      <p className="text-[10px] text-[color:var(--md-on-surface-variant)]">
                        Master password required above, then touch your key
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setShowGuest((v) => !v);
              setGuestSuccess(null);
              setError('');
            }}
            className="w-full mt-4 flex items-center justify-center gap-1.5 text-sm text-[color:var(--md-on-surface-variant)] min-h-[44px]"
          >
            Guest access
            <ChevronDown className={cn('w-4 h-4 transition-transform', showGuest && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {showGuest && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <form onSubmit={handleGuestUnlock} className="mt-2 space-y-3 p-4 rounded-xl border border-[color:var(--md-outline)] bg-[color:var(--md-surface-container)]">
                  <p className="text-[10px] text-[color:var(--md-on-surface-variant)]">
                    Unlock a shared item with a grant ID and passphrase — no vault login required.
                  </p>
                  <input
                    type="text"
                    value={guestGrantId}
                    onChange={(e) => setGuestGrantId(e.target.value)}
                    placeholder="Grant ID"
                    autoComplete="off"
                    spellCheck={false}
                    className="m3-field text-sm"
                  />
                  <div className="relative">
                    <input
                      type={showGuestPassphrase ? 'text' : 'password'}
                      value={guestPassphrase}
                      onChange={(e) => setGuestPassphrase(e.target.value)}
                      placeholder="Guest passphrase (min 12 chars)"
                      autoComplete="off"
                      spellCheck={false}
                      className="m3-field text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGuestPassphrase(!showGuestPassphrase)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--md-on-surface-variant)]"
                    >
                      {showGuestPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !guestGrantId.trim() || !guestPassphrase}
                    className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-outline)] text-sm font-semibold disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" />
                    {isLoading ? 'Unlocking…' : 'Unlock guest item'}
                  </button>
                  {guestSuccess && (
                    <div className="p-3 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/20 text-xs text-cyber-cyan space-y-1">
                      <p className="font-semibold">Guest access granted</p>
                      <p>Type: {guestSuccess.kind}</p>
                      <p className="break-all">Staging: {guestSuccess.staging_path}</p>
                      <p className="text-[10px] opacity-80">
                        Files are decrypted to a temporary staging folder. Access expires when the grant TTL ends.
                      </p>
                    </div>
                  )}
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setShowRecovery(true)}
            className="w-full mt-4 text-center text-sm text-[color:var(--md-on-surface-variant)] hover:text-cyber-cyan transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-purple rounded-lg"
          >
            Can&rsquo;t sign in?
          </button>

          <button
            type="button"
            onClick={logOut}
            className="w-full mt-2 text-center text-sm text-[color:var(--md-on-surface-variant)] hover:text-accent-danger transition-colors min-h-[44px]"
          >
            Sign out instead
          </button>
        </div>
      </motion.div>
    </div>
  );
}
