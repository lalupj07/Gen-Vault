'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { COMPANY, PRODUCT } from '@/lib/company';
import { api, invokeErrorMessage } from '@/lib/api';
import { User, Key } from 'lucide-react';
import AccountRecoveryScreen from './AccountRecoveryScreen';
import DemoBadge from './DemoBadge';
import { isDemoMode } from '@/lib/demo/flag';

function VaultEmblem() {
  return (
    <div className="relative w-24 h-24 mx-auto mb-5">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--cyber-cyan, #00e5ff) 35%, transparent), transparent 70%)',
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-1 rounded-[1.75rem] border border-cyber-cyan/25"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.15 }}
        className="absolute inset-2 rounded-[1.5rem] bg-gradient-to-br from-cyber-cyan via-cyber-blue to-cyber-purple flex items-center justify-center shadow-[0_12px_40px_rgba(0,229,255,0.28)] overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
        <svg width="44" height="44" viewBox="0 0 32 32" fill="none" aria-hidden className="relative z-[1] text-white drop-shadow-md">
          <path
            d="M16 2.5 L28 9.2 V18.5 C28 24.2 22.8 28.8 16 30.5 C9.2 28.8 4 24.2 4 18.5 V9.2 L16 2.5Z"
            fill="currentColor"
            fillOpacity="0.2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
          <path d="M16 10.6 V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16 19 V21.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10.6 16 H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M19 16 H21.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </motion.div>
    </div>
  );
}

export default function OfflineAuthScreen() {
  const { authFlow, createAccount, logIn, resetToSetup } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const isSetup = authFlow === 'setup_account';

  useEffect(() => {
    if (isSetup) return;
    let active = true;
    api.getLoginHint()
      .then((hint) => {
        if (active && hint?.trim()) setUsername(hint.trim());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isSetup]);

  if (showRecovery && !isSetup) {
    return (
      <>
      <DemoBadge />
      <AccountRecoveryScreen
        username={username}
        onBack={() => setShowRecovery(false)}
        onResetComplete={() => {
          setShowRecovery(false);
          setUsername('');
          setDisplayName('');
          setMasterPassword('');
          setError('');
          resetToSetup();
        }}
      />
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSetup) {
        const result = await createAccount(username, displayName, masterPassword);
        if (!result.success) {
          setError(result.error?.trim() || 'Account creation failed. Try "Reset local vault data" below.');
        }
      } else {
        const result = await logIn(username, masterPassword);
        if (!result.success) {
          setError(result.error?.trim() || 'Invalid username or password');
        }
      }
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <DemoBadge />
    <div className="fixed inset-0 bg-vault-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <VaultEmblem />
          <h1 className="text-2xl font-bold text-vault-light mb-2">
            {isSetup ? 'Create Your Vault' : 'Unlock Your Vault'}
          </h1>
          <p className="text-sm text-vault-muted">
            {isDemoMode()
              ? isSetup
                ? 'Set up a demo vault with a master password'
                : 'Enter your credentials to access the demo vault'
              : isSetup
                ? 'Set up your offline encrypted vault with a master password'
                : 'Enter your credentials to access your encrypted vault'}
          </p>
          {isDemoMode() && (
            <p className="mt-2 text-sm text-vault-muted">
              Browser demo only — not encrypted like the real GenVault app. Do not store real secrets.
            </p>
          )}
          <p className="text-[10px] text-cyber-cyan/70 mt-2">{PRODUCT.tagline}</p>
          <p className="text-[10px] text-vault-muted/60 mt-1">{COMPANY.name} · v{PRODUCT.version}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-vault-muted mb-2">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm focus:outline-none focus:border-cyber-cyan/40 transition-colors"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          {isSetup && (
            <div>
              <label className="block text-xs text-vault-muted mb-2">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm focus:outline-none focus:border-cyber-cyan/40 transition-colors"
                placeholder="Enter your display name"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-vault-muted mb-2">Master Password</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm focus:outline-none focus:border-cyber-cyan/40 transition-colors"
                placeholder="Enter master password"
                required
                minLength={8}
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-xs"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading || resetting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Processing...' : isSetup ? 'Create Vault' : 'Unlock Vault'}
          </button>
        </form>

        {isSetup && (
          <div className="mt-4 text-center">
            <button
              type="button"
              disabled={loading || resetting}
              onClick={async () => {
                if (!window.confirm('Delete all local GenVault data on this device and start over?')) return;
                setResetting(true);
                setError('');
                try {
                  await api.resetLocalAccount();
                  setError('');
                  window.location.reload();
                } catch (e) {
                  setError(invokeErrorMessage(e));
                } finally {
                  setResetting(false);
                }
              }}
              className="text-xs text-vault-muted hover:text-accent-danger transition-colors disabled:opacity-50"
            >
              {resetting ? 'Resetting...' : 'Reset local vault data'}
            </button>
          </div>
        )}

        {!isSetup && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowRecovery(true)}
              className="min-h-[44px] px-2 text-xs text-vault-muted hover:text-cyber-cyan transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-purple rounded-lg"
            >
              Can&rsquo;t sign in?
            </button>
          </div>
        )}

        <div className="mt-6 text-center space-y-1">
          <p className="text-[10px] text-vault-muted/60">
            {isDemoMode()
              ? 'Browser demo — not encrypted like the production app'
              : '🔒 Zero-Knowledge Architecture • AES-256-GCM Encryption'}
          </p>
          <p className="text-[10px] text-vault-muted/50">
            {COMPANY.copyright} · {COMPANY.licenses.join(' & ')}
          </p>
        </div>
      </motion.div>

    </div>
    </>
  );
}
