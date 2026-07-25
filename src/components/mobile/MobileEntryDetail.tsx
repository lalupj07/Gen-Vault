'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Check, Trash2, Star, Tag } from 'lucide-react';
import { api, type VaultEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { copySecure, clipboardClearSeconds } from '@/lib/secure-clipboard';
import { vibrateOnOtpExpiry } from '@/lib/time-sync';
import { isDemoMode } from '@/lib/demo/flag';

interface Props {
  entry: VaultEntry;
  onBack: () => void;
  onDeleted: () => void;
  onUpdated?: () => void;
}

const CLEAR_MS = 30_000;

export default function MobileEntryDetail({ entry, onBack, onDeleted, onUpdated }: Props) {
  const [code, setCode] = useState('');
  const [remain, setRemain] = useState(0);
  const [period, setPeriod] = useState(entry.period || 30);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [loadingOtp, setLoadingOtp] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [favorite, setFavorite] = useState(!!entry.favorite);
  const [notes, setNotes] = useState('');
  const [notesRevealed, setNotesRevealed] = useState(false);
  const [tagsInput, setTagsInput] = useState((entry.tags || []).join(', '));
  const [savingMeta, setSavingMeta] = useState(false);
  const prevRemainRef = useRef<number | null>(null);

  useEffect(() => {
    setNotes('');
    setNotesRevealed(false);
  }, [entry.id]);

  const revealNotes = async () => {
    const password = window.prompt('Confirm master password to reveal notes:');
    if (!password) return;
    try {
      const n = await api.revealEntryNotes(entry.id, password);
      setNotes(n);
      setNotesRevealed(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reveal notes');
    }
  };
  const isTotp = entry.period > 0 && !entry.is_hotp;
  const isHotp = !!entry.is_hotp;

  const refreshOtp = useCallback(async () => {
    if (!isTotp && !isHotp) return;
    try {
      const otp = await api.generateOtp(entry.id);
      setCode(otp.code);
      setRemain(otp.seconds_remaining);
      setPeriod(otp.period || entry.period || 30);
      setError('');
      setOtpError('');
    } catch (e) {
      setCode('');
      setOtpError(e instanceof Error ? e.message : 'Could not generate code');
    } finally {
      setLoadingOtp(false);
    }
  }, [entry.id, entry.period, isTotp, isHotp]);

  useEffect(() => {
    refreshOtp();
    if (!isTotp) return;
    const id = window.setInterval(refreshOtp, 1000);
    return () => window.clearInterval(id);
  }, [refreshOtp, isTotp]);

  useEffect(() => {
    if (!isTotp) return;
    const prev = prevRemainRef.current;
    if (prev != null && prev <= 2 && remain > 10) {
      vibrateOnOtpExpiry();
    }
    prevRemainRef.current = remain;
  }, [remain, isTotp]);

  const copy = async (text: string) => {
    try {
      await copySecure(text, CLEAR_MS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard unavailable');
    }
  };

  const toggleFavorite = async () => {
    try {
      const next = await api.toggleEntryFavorite(entry.id);
      setFavorite(next);
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update favorite');
    }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    setError('');
    try {
      if (notesRevealed) {
        await api.updateVaultEntry(entry.id, { notes: notes.trim() });
      }
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await api.updateEntryTags(entry.id, tags);
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
    setSavingMeta(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete “${entry.name}”? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.removeVaultEntry(entry.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
    }
  };

  const nextHotp = async () => {
    try {
      await api.incrementHotpCounter(entry.id);
      await refreshOtp();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'HOTP advance failed');
    }
  };

  const progress = period > 0 ? remain / period : 0;
  const isLow = remain <= 5;

  return (
    <div className="space-y-5 pt-1 pb-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-vault-muted hover:text-vault-light hover:bg-vault-panel transition-colors duration-200"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-vault-light truncate flex-1">{entry.name}</h2>
        <button
          type="button"
          onClick={toggleFavorite}
          className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center"
          aria-label={favorite ? 'Unfavorite' : 'Favorite'}
        >
          <Star className={cn('w-5 h-5', favorite ? 'fill-accent-warning text-accent-warning' : 'text-vault-muted')} />
        </button>
      </div>

      <div className="m3-glass p-6 text-center">
        <p className="text-xs text-[color:var(--md-on-surface-variant)] mb-1">
          {entry.issuer || entry.category}
          {isHotp ? ' · HOTP' : isTotp ? ' · TOTP' : ''}
        </p>
        {(isTotp || isHotp) ? (
          <>
            {isTotp && (
              <div className="relative w-36 h-36 mx-auto my-4" aria-hidden>
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="color-mix(in srgb, var(--md-primary) 20%, transparent)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="var(--md-primary)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${progress * 264} 264`}
                    className="transition-[stroke-dasharray] duration-1000 linear"
                  />
                </svg>
                <span className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center text-[color:var(--md-on-surface-variant)]',
                  isLow && 'text-[color:var(--md-error)] animate-pulse',
                )}>
                  <span className="text-2xl font-bold tabular-nums text-[color:var(--md-on-surface)]">{remain}</span>
                  <span className="text-[10px] uppercase tracking-wider">sec</span>
                </span>
              </div>
            )}
            <p className={cn(
              'font-mono tracking-[0.18em] tabular-nums',
              'text-5xl sm:text-5xl leading-tight',
              isLow && 'text-[color:var(--md-error)]',
              !code && !otpError && 'text-[color:var(--md-on-surface-variant)]',
              code && !isLow && 'text-[color:var(--md-on-surface)]',
            )}>
              {otpError
                ? '—'
                : loadingOtp
                  ? '··· ···'
                  : code
                    ? `${code.slice(0, 3)} ${code.slice(3)}`
                    : '··· ···'}
            </p>
            {otpError && (
              <p className="mt-2 text-sm text-[color:var(--md-error)] font-medium" role="alert">{otpError}</p>
            )}
            <button
              type="button"
              onClick={() => code && copy(code)}
              disabled={!code}
              className={cn(
                'mt-5 w-full min-h-[52px] rounded-[var(--m3-radius-lg)] font-semibold flex items-center justify-center gap-2 transition-colors duration-200',
                copied
                  ? 'bg-cyber-emerald/20 text-cyber-emerald'
                  : 'm3-fab !w-full !h-auto'
              )}
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {copied
                ? `Copied · clears in ${clipboardClearSeconds(CLEAR_MS)}s`
                : 'Copy code'}
            </button>
            {isHotp && (
              <button
                type="button"
                onClick={nextHotp}
                className="mt-3 w-full min-h-[44px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-outline)] text-sm text-[color:var(--md-on-surface)]"
              >
                Advance HOTP counter
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-[color:var(--md-on-surface-variant)] mt-4 mb-4">
              {isDemoMode()
                ? 'Demo storage — not encrypted like production. Reveal only when needed — clipboard auto-clears.'
                : 'Password is encrypted at rest. Reveal only when needed — clipboard auto-clears.'}
            </p>
            <button
              type="button"
              onClick={async () => {
                const password = window.prompt('Confirm master password to reveal:');
                if (!password) return;
                try {
                  const pw = await api.revealEntrySecret(entry.id, password);
                  await copy(pw);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not reveal password');
                }
              }}
              className={cn(
                'w-full min-h-[52px] rounded-[var(--m3-radius-lg)] font-semibold flex items-center justify-center gap-2',
                copied
                  ? 'bg-cyber-emerald/20 text-cyber-emerald'
                  : 'm3-fab !w-full !h-auto',
              )}
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {copied
                ? `Copied · clears in ${clipboardClearSeconds(CLEAR_MS)}s`
                : 'Reveal & copy password'}
            </button>
          </>
        )}
      </div>

      <section className="m3-glass p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-[color:var(--md-primary)]" />
          <p className="m3-title-md">Folder & tags</p>
        </div>
        <p className="text-xs text-[color:var(--md-on-surface-variant)]">Category: {entry.category || '—'}</p>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="Tags (comma-separated)"
          className="m3-field text-sm"
        />
        <label className="block">
          <span className="text-xs text-[color:var(--md-on-surface-variant)] mb-1 block">Secure notes</span>
          {!notesRevealed ? (
            <button
              type="button"
              onClick={revealNotes}
              className="w-full min-h-[44px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-outline-variant)] text-sm font-medium text-[color:var(--md-on-surface)]"
            >
              Reveal notes (master password)
            </button>
          ) : (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Private notes for this account"
              className="m3-field py-2 min-h-[88px] text-sm resize-y"
            />
          )}
        </label>
        <button
          type="button"
          disabled={savingMeta}
          onClick={saveMeta}
          className="w-full min-h-[44px] rounded-[var(--m3-radius-lg)] bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)] text-sm font-medium disabled:opacity-50"
        >
          {savingMeta ? 'Saving…' : notesRevealed ? 'Save notes & tags' : 'Save tags'}
        </button>
      </section>

      {error && (
        <p className="text-sm text-[color:var(--md-error)]" role="alert">{error}</p>
      )}

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="w-full min-h-[48px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-error)]/30 text-[color:var(--md-error)] flex items-center justify-center gap-2 hover:bg-[color:var(--md-error)]/10 transition-colors duration-200 disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        {deleting ? 'Deleting…' : 'Delete entry'}
      </button>
    </div>
  );
}
