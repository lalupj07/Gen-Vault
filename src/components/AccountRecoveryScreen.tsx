'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, KeyRound, Trash2 } from 'lucide-react';
import PasswordReset from '@/components/PasswordReset';
import { api, invokeErrorMessage } from '@/lib/api';
import { VAULT_ERASE_CONFIRMATION, isVaultEraseConfirmation } from '@/lib/vault-reset';
import { isDemoMode } from '@/lib/demo/flag';

type View = 'options' | 'recovery-code' | 'erase-confirmation';
type RecoveryStatus = 'checking' | 'available' | 'unavailable' | 'unknown';

interface AccountRecoveryScreenProps {
  username: string;
  onBack: () => void;
  onResetComplete: () => void;
}

export default function AccountRecoveryScreen({
  username,
  onBack,
  onResetComplete,
}: AccountRecoveryScreenProps) {
  const [view, setView] = useState<View>('options');
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('checking');
  const [confirmation, setConfirmation] = useState('');
  const [erasing, setErasing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.hasAccountRecoveryCodes()
      .then((hasCodes) => {
        if (active) setRecoveryStatus(hasCodes ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (active) setRecoveryStatus('unknown');
      });
    return () => {
      active = false;
      setConfirmation('');
    };
  }, []);

  const goTo = (next: View) => {
    setError('');
    setConfirmation('');
    setView(next);
  };

  const handleErase = async () => {
    if (!isVaultEraseConfirmation(confirmation) || erasing) return;
    setErasing(true);
    setError('');
    try {
      await api.eraseVaultAndReset(confirmation);
      setConfirmation('');
      onResetComplete();
    } catch (e) {
      setConfirmation('');
      setError(invokeErrorMessage(e) || 'The vault could not be fully erased. Try again.');
    } finally {
      setErasing(false);
    }
  };

  if (view === 'recovery-code') {
    return (
      <PasswordReset
        username={username}
        onSuccess={onBack}
        onCancel={() => goTo('options')}
      />
    );
  }

  return (
    <main className="fixed inset-0 bg-vault-black flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md rounded-[var(--m3-radius-lg)] border border-vault-border/40 bg-vault-dark p-6"
        aria-labelledby="account-recovery-title"
      >
        {view === 'options' ? (
          <>
            <button
              type="button"
              onClick={onBack}
              className="min-h-[48px] inline-flex items-center gap-2 text-sm text-vault-muted hover:text-vault-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-purple rounded-lg"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Back to login
            </button>
            <h1 id="account-recovery-title" className="mt-6 text-2xl font-semibold text-vault-light">
              Can&rsquo;t sign in?
            </h1>
            <p className="mt-2 max-w-[68ch] text-sm text-vault-muted">
              Choose recovery to keep your vault, or erase this device&rsquo;s vault and start over.
            </p>

            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => goTo('recovery-code')}
                disabled={recoveryStatus === 'checking' || recoveryStatus === 'unavailable'}
                className="min-h-[48px] w-full rounded-xl bg-cyber-purple px-4 text-sm font-semibold text-vault-black disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-purple"
              >
                <span className="inline-flex items-center gap-2">
                  <KeyRound aria-hidden className="h-4 w-4" />
                  Use a recovery code
                </span>
              </button>
              <p className="text-xs text-vault-muted" aria-live="polite">
                {recoveryStatus === 'checking' && 'Checking recovery codes\u2026'}
                {recoveryStatus === 'unavailable' && 'No recovery codes are enrolled on this device.'}
                {recoveryStatus === 'unknown' && 'Recovery-code availability could not be checked.'}
              </p>

              <button
                type="button"
                onClick={() => goTo('erase-confirmation')}
                className="min-h-[48px] w-full rounded-xl border border-accent-danger/40 px-4 text-sm font-medium text-accent-danger hover:bg-accent-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-danger"
              >
                Erase vault and start fresh
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => goTo('options')}
              disabled={erasing}
              className="min-h-[48px] inline-flex items-center gap-2 text-sm text-vault-muted hover:text-vault-light disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-purple rounded-lg"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Go back
            </button>

            <AlertTriangle aria-hidden className="mt-6 h-9 w-9 text-accent-danger" />
            <h1 id="account-recovery-title" className="mt-4 text-2xl font-semibold text-vault-light">
              Permanently erase this vault?
            </h1>
            <p className="mt-3 max-w-[68ch] text-sm leading-6 text-vault-muted">
              All local TOTP secrets, passwords, notes, attachments, settings, and recovery codes
              will be deleted. {isDemoMode()
                ? 'GenXis cannot restore lost demo credentials.'
                : 'GenXis cannot restore a zero-knowledge vault.'}
            </p>

            <label htmlFor="vault-erase-confirmation" className="mt-6 block text-sm text-vault-light">
              Type {VAULT_ERASE_CONFIRMATION} to continue
            </label>
            <input
              id="vault-erase-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={erasing}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="m3-field mt-2 w-full"
            />

            {error && (
              <p role="alert" className="mt-3 text-sm text-accent-danger">
                {error}
              </p>
            )}
            <p className="sr-only" aria-live="assertive">
              {erasing ? 'Erasing local vault data' : ''}
            </p>

            <button
              type="button"
              onClick={handleErase}
              disabled={!isVaultEraseConfirmation(confirmation) || erasing}
              className="mt-6 min-h-[48px] w-full rounded-xl bg-accent-danger px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-danger"
            >
              <span className="inline-flex items-center gap-2">
                <Trash2 aria-hidden className="h-4 w-4" />
                {erasing ? 'Erasing\u2026' : 'Erase vault'}
              </span>
            </button>
          </>
        )}
      </motion.section>
    </main>
  );
}
