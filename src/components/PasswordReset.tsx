'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Check, AlertCircle } from 'lucide-react';
import { api, invokeErrorMessage } from '@/lib/api';
import { validatePassword } from '@/lib/validation';

interface PasswordResetProps {
  username: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PasswordReset({ username, onSuccess, onCancel }: PasswordResetProps) {
  const [resolvedUsername, setResolvedUsername] = useState(username.trim());
  const [hasCodes, setHasCodes] = useState<boolean | null>(null);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    api.hasAccountRecoveryCodes()
      .then((has) => {
        if (active) setHasCodes(has);
      })
      .catch(() => {
        if (active) {
          setHasCodes(false);
          setError('Failed to check recovery methods');
        }
      });

    if (!username.trim()) {
      api.getLoginHint()
        .then((hint) => {
          if (active && hint?.trim()) setResolvedUsername(hint.trim());
        })
        .catch(() => {});
    } else {
      setResolvedUsername(username.trim());
    }

    return () => {
      active = false;
    };
  }, [username]);

  const handlePasswordReset = async () => {
    const accountUsername = resolvedUsername.trim();
    if (!accountUsername) {
      setError('Enter the vault username');
      return;
    }
    if (!recoveryCode.trim()) {
      setError('Enter a recovery code');
      return;
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.isValid) {
      setError(pwCheck.errors.join(', '));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.resetPasswordWithRecoveryCode(
        accountUsername,
        recoveryCode.trim(),
        newPassword,
      );
      setSuccess(true);
      setTimeout(() => onSuccess(), 2000);
    } catch (e) {
      setError(invokeErrorMessage(e) || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-vault-black/95 flex items-center justify-center p-4 z-50">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <div className="bg-vault-dark border border-vault-border/40 rounded-2xl p-6 text-center">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-vault-light mb-2">Password Reset Successful</h2>
            <p className="text-sm text-vault-muted">You can now log in with your new password.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-vault-black/95 flex items-center justify-center p-4 z-50 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
        <div className="bg-vault-dark border border-vault-border/40 rounded-2xl p-6">
          <div className="text-center mb-6">
            <Key className="w-10 h-10 text-cyber-cyan mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-vault-light mb-2">Reset Your Password</h2>
            <p className="text-sm text-vault-muted">
              Enter your vault username, a one-time recovery code, and your new password
            </p>
          </div>

          {hasCodes === false && (
            <div className="text-center py-6">
              <AlertCircle className="w-12 h-12 text-accent-warning mx-auto mb-4" />
              <p className="text-vault-light mb-4">No recovery codes enrolled. Set them up after signing in.</p>
              <button onClick={onCancel} className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black font-medium">
                Back to Login
              </button>
            </div>
          )}

          {hasCodes && (
            <>
              <div className="space-y-4 mb-4">
                <input
                  type="text"
                  value={resolvedUsername}
                  onChange={(e) => setResolvedUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm"
                  placeholder="Vault username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light font-mono text-sm tracking-wider"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm"
                  placeholder="New password"
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm"
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-xs text-accent-danger mb-4" role="alert">{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={onCancel} className="flex-1 min-h-[48px] py-3 rounded-xl border border-vault-border/40 text-vault-light">Cancel</button>
                <button type="button" onClick={handlePasswordReset} disabled={loading} className="flex-1 min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black font-medium disabled:opacity-50">
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </>
          )}

          {hasCodes === null && <p className="text-center text-sm text-vault-muted">Checking recovery options...</p>}
          {error && hasCodes === null && <p className="text-xs text-accent-danger mt-2">{error}</p>}
        </div>
      </motion.div>
    </div>
  );
}
