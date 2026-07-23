'use client';

import { useState } from 'react';
import { ArrowLeft, QrCode } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { analyzeOtpauthUri, otpauthBlocked } from '@/lib/otpauth-safety';
import { useI18n } from '@/lib/i18n';
import QRScanner from '@/components/QRScanner';
import { M3Section } from './m3';

interface Props {
  onBack: () => void;
  onSaved: (entryId?: string) => void;
}

type Kind = 'totp' | 'password';

export default function MobileAddEntry({ onBack, onSaved }: Props) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>('totp');
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [secret, setSecret] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('Personal');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const importFromUri = async (uri: string) => {
    setError('');
    const warnings = analyzeOtpauthUri(uri);
    if (otpauthBlocked(warnings)) {
      setError(warnings.find((w) => w.level === 'block')?.message || 'Invalid authenticator QR');
      return;
    }
    setBusy(true);
    try {
      const created = await api.importOtpauthUri(uri.trim(), category.trim() || 'Imported');
      setSecret('');
      onSaved(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import QR');
      setBusy(false);
    }
  };

  const handleScan = (text: string) => {
    setShowScanner(false);
    void importFromUri(text);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    try {
      if (kind === 'totp') {
        const cleaned = secret.replace(/\s+/g, '').toUpperCase();
        if (!cleaned) {
          setError('TOTP secret is required — or tap Scan QR');
          setBusy(false);
          return;
        }
        const created = await api.importManualEntry(
          name.trim(),
          issuer.trim() || name.trim(),
          cleaned,
          category.trim() || 'Personal',
        );
        setSecret('');
        onSaved(created.id);
      } else {
        if (!password) {
          setError('Password is required');
          setBusy(false);
          return;
        }
        const created = await api.addVaultEntry({
          name: name.trim(),
          issuer: issuer.trim() || name.trim(),
          secret: password,
          category: category.trim() || 'Personal',
          icon: 'key',
          color: '#ffe600',
          digits: 6,
          period: 0,
        });
        if (notes.trim()) {
          await api.updateVaultEntry(created.id, { notes: notes.trim() });
        }
        setPassword('');
        onSaved();
      }
      setSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save entry');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pt-1 pb-8">
      {showScanner && (
        <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-vault-muted hover:text-vault-light hover:bg-vault-panel transition-colors duration-200"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="m3-title-lg">{t('mobile.add.title')}</h2>
      </div>

      <div className="flex gap-2 p-1 m3-glass">
        {(['totp', 'password'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'flex-1 min-h-[40px] rounded-[var(--m3-radius-md)] text-sm font-medium transition-colors duration-200',
              kind === k
                ? 'm3-fab !w-auto !h-auto !rounded-[var(--m3-radius-md)]'
                : 'text-[color:var(--md-on-surface-variant)]'
            )}
          >
            {k === 'totp' ? t('mobile.add.totp') : t('mobile.add.password')}
          </button>
        ))}
      </div>

      {kind === 'totp' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError('');
            setShowScanner(true);
          }}
          className="w-full min-h-[52px] m3-fab !w-full !h-auto !rounded-[var(--m3-radius-lg)] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <QrCode className="w-5 h-5" />
          {t('mobile.add.scan')}
        </button>
      )}

      <form onSubmit={submit} className="space-y-3">
        {kind === 'totp' && (
          <p className="text-xs text-[color:var(--md-on-surface-variant)] text-center">{t('mobile.add.manual')}</p>
        )}
        <M3Section>
          <div className="space-y-3">
            <Field label={t('mobile.add.name')} value={name} onChange={setName} required={kind === 'password'} autoComplete="off" />
            <Field label={t('mobile.add.issuer')} value={issuer} onChange={setIssuer} autoComplete="off" />
            <Field label={t('mobile.add.category')} value={category} onChange={setCategory} autoComplete="off" />
          </div>
        </M3Section>
        {kind === 'totp' ? (
          <div className="m3-glass p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="totp-secret" className="block text-xs text-[color:var(--md-on-surface-variant)]">{t('mobile.add.secret')}</label>
              <button
                type="button"
                className="text-[10px] text-[color:var(--md-primary)] min-h-[32px]"
                onClick={() => setShowSecret((v) => !v)}
              >
                {showSecret ? t('mobile.add.hide') : t('mobile.add.show')}
              </button>
            </div>
            <input
              id="totp-secret"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
              className="m3-field font-mono tracking-wider"
            />
          </div>
        ) : (
          <>
            <div className="m3-glass p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="pw-secret" className="block text-xs text-[color:var(--md-on-surface-variant)]">{t('mobile.add.password_field')}</label>
                <button
                  type="button"
                  className="text-[10px] text-[color:var(--md-primary)] min-h-[32px]"
                  onClick={() => setShowSecret((v) => !v)}
                >
                  {showSecret ? t('mobile.add.hide') : t('mobile.add.show')}
                </button>
              </div>
              <input
                id="pw-secret"
                type={showSecret ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="m3-field"
              />
            </div>
            <Field label={t('mobile.add.notes')} value={notes} onChange={setNotes} multiline />
          </>
        )}

        {error && <p className="text-sm text-[color:var(--md-error)]" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={busy || (kind === 'totp' && !name.trim() && !secret.trim())}
          className="w-full min-h-[52px] rounded-[var(--m3-radius-lg)] bg-[color:var(--md-surface-container)] text-[color:var(--md-on-surface)] font-semibold border border-[color:var(--md-outline)] disabled:opacity-50"
        >
          {busy ? t('common.loading') : kind === 'totp' ? t('mobile.add.save_manual') : t('mobile.add.save')}
        </button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, required, multiline, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
  autoComplete?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  const cls = 'm3-field';
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-[color:var(--md-on-surface-variant)] mb-1.5">{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={cn(cls, 'py-3 min-h-[96px] resize-none')}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          className={cls}
        />
      )}
    </div>
  );
}
