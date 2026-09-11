'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Check, KeyRound, QrCode, PenLine, Star } from 'lucide-react';
import { api, type VaultEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { copySecure } from '@/lib/secure-clipboard';
import { useI18n } from '@/lib/i18n';
import { IssuerAvatar } from './IssuerAvatar';

interface Props {
  entries: VaultEntry[];
  loading: boolean;
  onOpenEntry: (id: string) => void;
  onScanQr?: () => void;
  onManual?: () => void;
}

function CodeCard({ entry, onOpen }: { entry: VaultEntry; onOpen: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [remain, setRemain] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const otp = await api.generateOtp(entry.id);
      setCode(otp.code);
      setRemain(otp.seconds_remaining);
      setError('');
    } catch (e) {
      setCode('');
      setError(e instanceof Error ? e.message : 'Could not generate code');
    }
  }, [entry.id]);

  useEffect(() => {
    refresh();
    if (entry.is_hotp) return;
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [refresh, entry.is_hotp]);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!code) return;
    try {
      await copySecure(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard unavailable');
    }
  };

  const isLow = remain <= 5 && !entry.is_hotp;
  const formatted = code.length >= 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

  return (
    <article className="m3-glass overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left p-4 min-h-[48px] hover:bg-[color-mix(in_srgb,var(--md-primary)_6%,transparent)] transition-colors duration-200"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <IssuerAvatar issuer={entry.issuer || entry.name} />
            <div className="min-w-0">
              <p className="text-[11px] text-[color:var(--md-on-surface-variant)] truncate">{entry.issuer || entry.category}</p>
              <p className="m3-title-md truncate">{entry.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {entry.favorite && (
              <Star className="w-4 h-4 text-accent-warning fill-accent-warning" aria-hidden />
            )}
            {!entry.is_hotp && (
              <span
                className={cn(
                  'text-[11px] font-mono px-2 py-0.5 rounded-full border tabular-nums',
                  isLow
                    ? 'text-[color:var(--md-error)] border-[color:var(--md-error)]/30 bg-[color:var(--md-error)]/10'
                    : 'text-[color:var(--md-on-primary-container)] border-[color:var(--md-primary)]/30 bg-[color:var(--md-primary-container)]',
                )}
              >
                {remain}s
              </span>
            )}
          </div>
        </div>

        {error ? (
          <p className="text-sm text-[color:var(--md-error)] font-medium" role="alert">{error}</p>
        ) : code ? (
          <p
            className={cn(
              'font-mono text-[2rem] leading-none font-bold tracking-[0.18em] tabular-nums',
              isLow ? 'text-[color:var(--md-error)]' : 'text-[color:var(--md-on-surface)]',
            )}
          >
            {formatted}
          </p>
        ) : (
          <p className="font-mono text-[2rem] text-[color:var(--md-on-surface-variant)] tracking-[0.18em]" aria-busy="true">
            ··· ···
          </p>
        )}
      </button>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={copy}
          disabled={!code}
          className={cn(
            'w-full min-h-[48px] rounded-[var(--m3-radius-md)] text-sm font-semibold flex items-center justify-center gap-2 transition-colors duration-200',
            copied
              ? 'bg-cyber-emerald/20 text-cyber-emerald'
              : 'm3-fab !w-full !h-auto disabled:opacity-40',
          )}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? t('common.copied') : t('mobile.codes.copy')}
        </button>
      </div>
    </article>
  );
}

export default function MobileCodes({
  entries, loading, onOpenEntry, onScanQr, onManual,
}: Props) {
  const { t } = useI18n();
  const totpEntries = useMemo(
    () => entries.filter((e) => e.period > 0 || e.is_hotp),
    [entries],
  );

  const countLabel =
    totpEntries.length === 1
      ? t('mobile.codes.count_one', { n: totpEntries.length })
      : t('mobile.codes.count', { n: totpEntries.length });

  return (
    <div className="space-y-4 pt-2 pb-4">
      <div>
        <h2 className="m3-title-lg">{t('mobile.codes.title')}</h2>
        <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-1">{countLabel}</p>
      </div>

      {loading ? (
        <ul className="space-y-3" aria-busy="true">
          {[1, 2].map((i) => (
            <li key={i} className="h-36 m3-glass animate-pulse" />
          ))}
        </ul>
      ) : totpEntries.length === 0 ? (
        <div className="m3-glass px-4 py-10 text-center border-dashed">
          <KeyRound
            className="w-10 h-10 mx-auto mb-3 text-[color:var(--md-on-surface-variant)] opacity-40"
            aria-hidden
          />
          <p className="text-sm font-medium text-[color:var(--md-on-surface)]">No authenticators yet</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onScanQr}
              className="w-full min-h-[48px] m3-fab !w-full !h-auto !rounded-[var(--m3-radius-lg)] font-semibold flex items-center justify-center gap-2"
            >
              <QrCode className="w-5 h-5" aria-hidden />
              Scan QR
            </button>
            <button
              type="button"
              onClick={onManual}
              className="w-full min-h-[48px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-outline)] text-sm font-semibold flex items-center justify-center gap-2 text-[color:var(--md-on-surface)]"
            >
              <PenLine className="w-4 h-4" aria-hidden />
              Manual
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {totpEntries.map((entry) => (
            <li key={entry.id}>
              <CodeCard entry={entry} onOpen={() => onOpenEntry(entry.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
