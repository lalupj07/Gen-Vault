'use client';

import { ShieldCheck, Star, Clock, ChevronRight } from 'lucide-react';
import type { VaultEntry } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  entries: VaultEntry[];
  score: number;
  loading: boolean;
  onOpenEntry: (id: string) => void;
  onOpenVault: () => void;
  onAdd: () => void;
}

export default function MobileHome({
  entries, score, loading, onOpenEntry, onOpenVault, onAdd,
}: Props) {
  const favorites = entries.filter((e) => e.favorite).slice(0, 8);
  const recent = [...entries]
    .sort((a, b) => (b.last_used || 0) - (a.last_used || 0))
    .slice(0, 6);
  const strip = favorites.length ? favorites : recent;

  const groups = Object.entries(
    entries.reduce<Record<string, number>>((acc, e) => {
      const key = e.category || 'Uncategorized';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).slice(0, 6);

  const scorePct = Math.max(0, Math.min(100, score));

  return (
    <div className="space-y-6 pt-2 pb-4">
      {/* Hero summary — Figma purple card → dark GenVault */}
      <section
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyber-purple to-[#5b35c7] p-5 shadow-[0_12px_40px_rgba(124,77,255,0.25)]"
        aria-label="Vault summary"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80 mb-1">Your vault is ready</p>
            <h2 className="text-xl font-semibold text-white text-balance leading-snug">
              {entries.length === 0
                ? 'Add your first code or password'
                : `${entries.length} encrypted entr${entries.length === 1 ? 'y' : 'ies'}`}
            </h2>
            <button
              type="button"
              onClick={entries.length ? onOpenVault : onAdd}
              className="mt-4 inline-flex items-center min-h-[40px] px-4 rounded-full bg-white/95 text-cyber-purple text-sm font-semibold hover:bg-white transition-colors duration-200"
            >
              {entries.length ? 'View vault' : 'Add entry'}
            </button>
          </div>
          <div className="relative w-[72px] h-[72px] flex-shrink-0" aria-hidden>
            <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
              <circle
                cx="36" cy="36" r="30" fill="none"
                stroke="white" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(scorePct / 100) * 188.5} 188.5`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="text-lg font-bold leading-none">{scorePct}</span>
              <span className="text-[9px] opacity-80">score</span>
            </div>
          </div>
        </div>
      </section>

      {/* Favorites / recent strip */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold text-vault-light">Quick access</h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyber-purple/15 text-cyber-purple font-medium">
            {strip.length}
          </span>
        </div>
        {loading ? (
          <div className="flex gap-3 overflow-hidden">
            {[1, 2].map((i) => (
              <div key={i} className="w-44 h-28 rounded-2xl bg-vault-panel border border-vault-border animate-pulse flex-shrink-0" />
            ))}
          </div>
        ) : strip.length === 0 ? (
          <p className="text-sm text-vault-muted">No entries yet. Tap + to add a TOTP or password.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {strip.map((e, i) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEntry(e.id)}
                className={cn(
                  'snap-start flex-shrink-0 w-44 text-left rounded-2xl p-3.5 border min-h-[112px] transition-colors duration-200',
                  i % 2 === 0
                    ? 'bg-cyber-blue/10 border-cyber-blue/25 hover:border-cyber-blue/50'
                    : 'bg-cyber-amber/10 border-cyber-amber/25 hover:border-cyber-amber/50'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {e.favorite ? (
                    <Star className="w-3.5 h-3.5 text-cyber-amber fill-cyber-amber" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-vault-muted" />
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-vault-muted truncate">
                    {e.category || 'Vault'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-vault-light line-clamp-2">{e.name}</p>
                <p className="text-xs text-vault-muted mt-1 truncate">{e.issuer || '—'}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Category groups */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold text-vault-light">Categories</h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-vault-hover text-vault-muted font-medium">
            {groups.length}
          </span>
        </div>
        {groups.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="space-y-2.5">
            {groups.map(([name, count]) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={onOpenVault}
                  className="w-full flex items-center gap-3 rounded-2xl bg-vault-panel border border-vault-border px-3.5 py-3 min-h-[56px] hover:border-cyber-purple/40 transition-colors duration-200 text-left"
                >
                  <span className="w-10 h-10 rounded-xl bg-cyber-purple/15 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5 text-cyber-purple" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-vault-light truncate">{name}</span>
                    <span className="block text-xs text-vault-muted">{count} entries</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-vault-muted flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="rounded-2xl border border-dashed border-vault-border bg-vault-panel/50 px-4 py-8 text-center">
      <p className="text-sm text-vault-muted">Categories appear after you add entries.</p>
    </div>
  );
}
