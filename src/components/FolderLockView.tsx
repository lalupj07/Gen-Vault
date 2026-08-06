'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FolderLock, Lock, Unlock, Search, Star, RefreshCw, RotateCcw,
  AlertTriangle, Clock, FolderPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  api,
  invokeErrorMessage,
  type LockedFolder,
  type FolderLockActivity,
  type FolderLockSettings,
} from '@/lib/api';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={item}
      className={cn('glass rounded-2xl p-5 border border-vault-border/50 card-hover', className)}
    >
      {children}
    </motion.div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function FolderLockView() {
  const [folders, setFolders] = useState<LockedFolder[]>([]);
  const [activity, setActivity] = useState<FolderLockActivity[]>([]);
  const [settings, setSettings] = useState<FolderLockSettings>({ auto_lock_mins: 15 });
  const [query, setQuery] = useState('');
  const [lockPath, setLockPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingLarge, setPendingLarge] = useState<{ path: string; size: number } | null>(null);
  const [unlockDeadline, setUnlockDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setUnlockDeadline(null);
    setSecondsLeft(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = query.trim()
        ? await api.folderLockSearch(query.trim())
        : await api.folderLockList();
      setFolders(list);
      setActivity(await api.folderLockActivity(30));
      setSettings(await api.folderLockSettingsGet());
      const unlocked = list.find((f) => f.status === 'unlocked');
      if (!unlocked) clearTimer();
    } catch (e) {
      setError(invokeErrorMessage(e));
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [query, clearTimer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (!unlockDeadline) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((unlockDeadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearTimer();
        const unlocked = folders.find((f) => f.status === 'unlocked');
        if (unlocked) {
          api
            .folderLockRelock(unlocked.id)
            .then(() => {
              setMessage('Auto-locked: staging wiped.');
              refresh();
            })
            .catch((e) => setError(invokeErrorMessage(e)));
        }
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [unlockDeadline, folders, clearTimer, refresh]);

  const startAutoLock = (mins: number) => {
    const ms = Math.max(1, mins) * 60 * 1000;
    setUnlockDeadline(Date.now() + ms);
  };

  const doLock = async (path: string, confirmLarge: boolean) => {
    setBusy(true);
    setError('');
    setMessage('');
    setPendingLarge(null);
    try {
      await api.folderLockLock(path, confirmLarge);
      setLockPath('');
      setMessage('Folder locked. Original path now shows a GenVault stub.');
      await refresh();
    } catch (e) {
      const msg = invokeErrorMessage(e);
      if (msg.startsWith('NEEDS_LARGE_CONFIRM:')) {
        const size = Number(msg.split(':')[1] || '0');
        setPendingLarge({ path, size });
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (id: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const staging = await api.folderLockUnlock(id, true);
      setMessage(`Unlocked to staging. Explorer opened at: ${staging}`);
      startAutoLock(settings.auto_lock_mins);
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRelock = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await api.folderLockRelock(id);
      clearTimer();
      setMessage('Staging wiped. Folder locked.');
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Restore "${name}" to its original path and remove Folder Lock protection?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.folderLockRestore(id);
      clearTimer();
      setMessage('Folder restored to original path.');
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleFavorite = async (id: string, favorite: boolean) => {
    try {
      await api.folderLockSetFavorite(id, !favorite);
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    }
  };

  const saveAutoLock = async (mins: number) => {
    try {
      const next = await api.folderLockSettingsSet(mins);
      setSettings(next);
      setMessage(`Auto-lock set to ${next.auto_lock_mins} minutes.`);
    } catch (e) {
      setError(invokeErrorMessage(e));
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-vault-light tracking-tight flex items-center gap-3">
            <FolderLock className="w-6 h-6 text-cyber-cyan" />
            Folder Lock
          </h1>
          <p className="text-sm text-vault-muted mt-1">
            Encrypt local NTFS folders. Unlock decrypts to a private staging folder — not the original path.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="p-2 rounded-lg text-vault-muted hover:text-cyber-cyan hover:bg-white/[0.03]"
          title="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </motion.div>

      <GlassCard className="border-cyber-cyan/20 bg-cyber-cyan/5">
        <div className="flex gap-3 text-sm text-vault-muted">
          <AlertTriangle className="w-4 h-4 text-accent-warning flex-shrink-0 mt-0.5" />
          <p>
            Staging unlock copies decrypted files under GenVault app data. Auto-lock wipes that staging copy.
            Ciphertext stays encrypted until you restore to the original path.
          </p>
        </div>
      </GlassCard>

      {(error || message) && (
        <GlassCard className={error ? 'border-accent-danger/40' : 'border-cyber-emerald/30'}>
          <p className={cn('text-sm', error ? 'text-accent-danger' : 'text-cyber-emerald')}>
            {error || message}
          </p>
        </GlassCard>
      )}

      {secondsLeft != null && (
        <GlassCard>
          <div className="flex items-center gap-2 text-sm text-accent-warning">
            <Clock className="w-4 h-4" />
            Auto-lock in {Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s — staging will be wiped.
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <FolderPlus className="w-4 h-4 text-cyber-cyan" />
          <span className="text-sm font-medium text-vault-light">Lock a folder</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={lockPath}
            onChange={(e) => setLockPath(e.target.value)}
            placeholder="Full path, e.g. C:\Users\You\Documents\Private"
            className="flex-1 bg-vault-dark/60 border border-vault-border/50 rounded-lg px-3 py-2 text-sm text-vault-light placeholder:text-vault-muted/50"
          />
          <button
            type="button"
            disabled={busy || !lockPath.trim()}
            onClick={() => doLock(lockPath.trim(), false)}
            className="px-4 py-2 rounded-lg bg-cyber-cyan/15 text-cyber-cyan text-sm font-medium hover:bg-cyber-cyan/25 disabled:opacity-40"
          >
            Lock
          </button>
        </div>
        {pendingLarge && (
          <div className="mt-3 p-3 rounded-lg border border-accent-warning/40 bg-accent-warning/5 text-sm">
            <p className="text-accent-warning mb-2">
              Folder is {formatBytes(pendingLarge.size)} (over 2 GB). Continue?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-accent-warning/20 text-accent-warning text-xs"
                onClick={() => doLock(pendingLarge.path, true)}
              >
                Confirm lock
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-vault-muted text-xs"
                onClick={() => setPendingLarge(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-vault-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locked folders"
            className="w-full pl-9 bg-vault-dark/60 border border-vault-border/50 rounded-lg px-3 py-2 text-sm text-vault-light"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-vault-muted whitespace-nowrap">
          Auto-lock
          <select
            value={settings.auto_lock_mins}
            onChange={(e) => saveAutoLock(Number(e.target.value))}
            className="bg-vault-dark/60 border border-vault-border/50 rounded-lg px-2 py-1.5 text-vault-light"
          >
            {[5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {loading ? (
          <GlassCard>
            <p className="text-sm text-vault-muted">Loading…</p>
          </GlassCard>
        ) : folders.length === 0 ? (
          <GlassCard>
            <p className="text-sm text-vault-muted text-center py-6">
              No locked folders yet. Enter a local path above or use Explorer → Lock with GenVault.
            </p>
          </GlassCard>
        ) : (
          folders.map((f) => (
            <GlassCard key={f.id}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleFavorite(f.id, f.favorite)}
                      className={f.favorite ? 'text-amber-400' : 'text-vault-muted'}
                      title="Favorite"
                    >
                      <Star className={cn('w-4 h-4', f.favorite && 'fill-current')} />
                    </button>
                    <span className="text-sm font-medium text-vault-light truncate">{f.display_name}</span>
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded',
                        f.status === 'unlocked'
                          ? 'bg-cyber-emerald/15 text-cyber-emerald'
                          : 'bg-vault-border/40 text-vault-muted',
                      )}
                    >
                      {f.status}
                    </span>
                  </div>
                  <p className="text-xs text-vault-muted mt-1 truncate" title={f.original_path}>
                    {f.original_path}
                  </p>
                  <p className="text-[11px] text-vault-muted/70 mt-0.5">{formatBytes(f.size_bytes)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {f.status === 'unlocked' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRelock(f.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-warning/15 text-accent-warning text-xs"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Lock now
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleUnlock(f.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-cyan/15 text-cyber-cyan text-xs"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Unlock
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRestore(f.id, f.display_name)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-vault-muted hover:text-vault-light text-xs border border-vault-border/40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </button>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      <GlassCard>
        <h2 className="text-sm font-medium text-vault-light mb-3">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="text-xs text-vault-muted">No activity yet.</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {activity.map((a) => (
              <li key={a.id} className="text-xs text-vault-muted flex justify-between gap-2">
                <span>
                  <span className="text-vault-light/80">{a.event}</span> — {a.message}
                </span>
                <span className="shrink-0 opacity-60">
                  {new Date(a.timestamp * 1000).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </motion.div>
  );
}
