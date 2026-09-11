'use client';

import { useMemo, useState } from 'react';
import { Search, Star, KeyRound } from 'lucide-react';
import type { VaultEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { M3Chip, M3ChipRow } from './m3';
import { IssuerAvatar } from './IssuerAvatar';

type Filter = 'all' | 'favorites' | 'totp' | 'other';

interface Props {
  entries: VaultEntry[];
  loading: boolean;
  onOpenEntry: (id: string) => void;
  onRefresh: () => void;
  onAddPassword?: () => void;
}

export default function MobileVaultList({
  entries, loading, onOpenEntry, onAddPassword,
}: Props) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [folder, setFolder] = useState<string | null>(null);

  const folders = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'favorites' && !e.favorite) return false;
      if (filter === 'totp' && e.period <= 0) return false;
      if (filter === 'other' && e.period > 0) return false;
      if (folder && e.category !== folder) return false;
      if (needle) {
        const tags = (e.tags || []).join(' ');
        const hay = `${e.name} ${e.issuer} ${e.category} ${tags}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, q, filter, folder]);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: t('mobile.vault.filter.all') },
    { id: 'favorites', label: t('mobile.vault.filter.favorites') },
    { id: 'totp', label: t('mobile.vault.filter.totp') },
    { id: 'other', label: t('mobile.vault.filter.other') },
  ];

  const trulyEmpty = entries.length === 0;

  return (
    <div className="space-y-4 pt-2 pb-4">
      <h2 className="m3-title-lg">{t('mobile.vault.title')}</h2>

      <label className="relative block">
        <span className="sr-only">{t('common.search')}</span>
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--md-on-surface-variant)] pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('mobile.vault.search')}
          className="m3-field !pl-10 placeholder:text-[color:var(--md-on-surface-variant)]/70"
        />
      </label>

      <M3ChipRow>
        {chips.map((c) => (
          <M3Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.label}
          </M3Chip>
        ))}
      </M3ChipRow>

      {folders.length > 0 && (
        <M3ChipRow>
          <M3Chip active={folder == null} onClick={() => setFolder(null)}>
            {t('mobile.vault.folders.all')}
          </M3Chip>
          {folders.map((f) => (
            <M3Chip key={f} active={folder === f} onClick={() => setFolder(f)}>
              {f}
            </M3Chip>
          ))}
        </M3ChipRow>
      )}

      {loading ? (
        <ul className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-20 m3-glass animate-pulse" />
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        trulyEmpty ? (
          <div className="m3-glass px-4 py-10 text-center border-dashed">
            <KeyRound
              className="w-10 h-10 mx-auto mb-3 text-[color:var(--md-on-surface-variant)] opacity-40"
              aria-hidden
            />
            <p className="text-sm font-medium text-[color:var(--md-on-surface)]">No passwords yet</p>
            <button
              type="button"
              onClick={onAddPassword}
              className="mt-4 w-full min-h-[48px] m3-fab !w-full !h-auto !rounded-[var(--m3-radius-lg)] font-semibold"
            >
              Add password
            </button>
          </div>
        ) : (
          <p className="text-sm text-[color:var(--md-on-surface-variant)] py-8 text-center">{t('mobile.vault.empty')}</p>
        )
      ) : (
        <ul className="m3-glass divide-y divide-[color:var(--md-outline-variant)] overflow-hidden p-0">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpenEntry(e.id)}
                className="w-full text-left px-4 py-3.5 min-h-[72px] hover:bg-[color-mix(in_srgb,var(--md-primary)_6%,transparent)] transition-colors duration-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <IssuerAvatar issuer={e.issuer || e.name} />
                    <div className="min-w-0">
                      <p className="text-[11px] text-[color:var(--md-on-surface-variant)] truncate">{e.issuer || e.category || 'Entry'}</p>
                      <p className="m3-title-md truncate mt-0.5">{e.name}</p>
                      <p className="text-xs text-[color:var(--md-on-primary-container)] mt-1.5 truncate">
                        {e.period > 0
                          ? `${e.digits}-digit ${e.is_hotp ? 'HOTP' : 'TOTP'} · ${e.period || 30}s`
                          : t('mobile.vault.credential')}
                        {(e.tags?.length ?? 0) > 0 ? ` · ${e.tags!.slice(0, 3).join(', ')}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {e.favorite && <Star className="w-4 h-4 text-accent-warning fill-accent-warning" />}
                    <span
                      className={cn(
                        'text-[11px] font-medium px-2.5 py-1 rounded-full',
                        e.period > 0
                          ? 'bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)]'
                          : 'bg-[color:var(--md-surface-container)] text-[color:var(--md-on-surface-variant)]'
                      )}
                    >
                      {e.period > 0 ? '2FA' : 'Pass'}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
