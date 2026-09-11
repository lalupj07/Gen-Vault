'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api, type VaultEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { IssuerAvatar } from './IssuerAvatar';

interface Props {
  onChanged?: () => void;
}

export default function MobileTrash({ onChanged }: Props) {
  const { travelMode } = useAuth();
  const [items, setItems] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.listTrashedEntries();
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trash');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restore = async (id: string) => {
    if (travelMode) return;
    setBusyId(id);
    setError('');
    try {
      await api.restoreVaultEntry(id);
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (entry: VaultEntry) => {
    if (travelMode) return;
    if (!window.confirm(`Delete “${entry.name}” forever? This cannot be undone.`)) return;
    setBusyId(entry.id);
    setError('');
    try {
      await api.purgeVaultEntry(entry.id);
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete forever failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pt-2 pb-4">
      <div>
        <h2 className="m3-title-lg">Trash</h2>
        <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-1">
          Soft-deleted entries · restore within 30 days
        </p>
      </div>

      {travelMode && (
        <div
          className="m3-glass px-3 py-2.5 border border-[color:var(--md-primary)]/25"
          role="status"
        >
          <p className="text-xs text-[color:var(--md-primary)] font-medium">
            Blocked in travel mode
          </p>
          <p className="text-[11px] text-[color:var(--md-on-surface-variant)] mt-0.5">
            Restore and delete forever are disabled until travel mode is off.
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-[color:var(--md-error)]" role="alert">{error}</p>
      )}

      {loading ? (
        <ul className="space-y-2.5" aria-busy="true">
          {[1, 2].map((i) => (
            <li key={i} className="h-20 m3-glass animate-pulse" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="m3-glass px-4 py-10 text-center border-dashed">
          <Trash2
            className="w-10 h-10 mx-auto mb-3 text-[color:var(--md-on-surface-variant)] opacity-40"
            aria-hidden
          />
          <p className="text-sm text-[color:var(--md-on-surface-variant)]">Trash is empty</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((e) => (
            <li key={e.id} className="m3-glass p-3">
              <div className="flex items-start gap-3">
                <IssuerAvatar issuer={e.issuer || e.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-[color:var(--md-on-surface-variant)] truncate">
                    {e.issuer || e.category || 'Entry'}
                  </p>
                  <p className="m3-title-md truncate">{e.name}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={travelMode || busyId === e.id}
                  onClick={() => void restore(e.id)}
                  className={cn(
                    'flex-1 min-h-[48px] rounded-[var(--m3-radius-md)] text-sm font-semibold',
                    'flex items-center justify-center gap-2',
                    'bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)]',
                    'disabled:opacity-40',
                  )}
                >
                  <RotateCcw className="w-4 h-4" aria-hidden />
                  Restore
                </button>
                <button
                  type="button"
                  disabled={travelMode || busyId === e.id}
                  onClick={() => void purge(e)}
                  className={cn(
                    'flex-1 min-h-[48px] rounded-[var(--m3-radius-md)] text-sm font-semibold',
                    'flex items-center justify-center gap-2',
                    'border border-[color:var(--md-error)]/30 text-[color:var(--md-error)]',
                    'disabled:opacity-40',
                  )}
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                  Delete forever
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
