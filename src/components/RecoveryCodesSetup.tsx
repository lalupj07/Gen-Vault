'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Copy, Check, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface RecoveryCodesSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export default function RecoveryCodesSetup({ onComplete, onCancel }: RecoveryCodesSetupProps) {
  const [codes, setCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateCodes = async () => {
    setLoading(true);
    setError('');
    try {
      const generated = await api.generateAccountRecoveryCodes();
      setCodes(generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate recovery codes');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    const { copySecure } = await import('@/lib/secure-clipboard');
    await copySecure(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (codes.length === 0) {
    return (
      <div className="fixed inset-0 bg-vault-black/95 flex items-center justify-center p-4 z-[60]">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <div className="bg-vault-dark border border-vault-border/40 rounded-2xl p-6 text-center">
            <Shield className="w-12 h-12 text-cyber-cyan mx-auto mb-4" />
            <h2 className="text-xl font-bold text-vault-light mb-2">Account Recovery Codes</h2>
            <p className="text-sm text-vault-muted mb-6">
              Generate one-time recovery codes to reset your password if you forget it. Store them offline in a safe place.
            </p>
            {error && <p className="text-xs text-accent-danger mb-4">{error}</p>}
            <div className="flex gap-3">
              {onCancel && (
                <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-vault-border/40 text-vault-light">
                  Skip
                </button>
              )}
              <button
                onClick={generateCodes}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black font-medium disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Codes'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-vault-black/95 flex items-center justify-center p-4 z-[60]">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
        <div className="bg-vault-dark border border-vault-border/40 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-accent-warning" />
            <h2 className="text-xl font-bold text-vault-light">Save Your Recovery Codes</h2>
          </div>
          <p className="text-xs text-vault-muted mb-4">
            Each code works once. These will not be shown again.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4 max-h-48 overflow-y-auto p-3 rounded-xl bg-vault-black/50 border border-vault-border/30">
            {codes.map((code) => (
              <code key={code} className="text-xs font-mono text-cyber-cyan py-1">
                {code}
              </code>
            ))}
          </div>
          <button
            onClick={copyAll}
            className="w-full mb-4 py-2 rounded-lg border border-vault-border/40 text-sm text-vault-light flex items-center justify-center gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy All Codes'}
          </button>
          <label className="flex items-start gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
            <span className="text-xs text-vault-muted">I have saved these codes in a secure offline location.</span>
          </label>
          <button
            onClick={onComplete}
            disabled={!confirmed}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black font-medium disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </motion.div>
    </div>
  );
}
