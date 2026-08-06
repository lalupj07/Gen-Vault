'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileLock2, Lock, Unlock, Search, Star, RefreshCw, RotateCcw,
  AlertTriangle, Clock, FilePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  api,
  invokeErrorMessage,
  type LockedFile,
  type FileLockActivity,
  type FileLockSettings,
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

function parsePaths(raw: string): string[] {
  return raw
    .split(/\r?\n|;/)
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

export default function FileLockView({
  prefill,
  onPrefillConsumed,
}: {
  prefill?: { action: string; path: string | null; paths?: string[]; id: string | null } | null;
  onPrefillConsumed?: () => void;
}) {
  const [files, setFiles] = useState<LockedFile[]>([]);
  const [activity, setActivity] = useState<FileLockActivity[]>([]);
  const [settings, setSettings] = useState<FileLockSettings>({ auto_lock_mins: 15 });
  const [query, setQuery] = useState('');
  const [lockPaths, setLockPaths] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingLarge, setPendingLarge] = useState<{ paths: string[]; size: number } | null>(null);
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
        ? await api.fileLockSearch(query.trim())
        : await api.fileLockList();
      setFiles(list);
      setActivity(await api.fileLockActivity(30));
      setSettings(await api.fileLockSettingsGet());
      if (!list.some((f) => f.status === 'unlocked')) clearTimer();
    } catch (e) {
      setError(invokeErrorMessage(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [query, clearTimer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!unlockDeadline) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((unlockDeadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearTimer();
        const unlocked = files.filter((f) => f.status === 'unlocked');
        Promise.all(unlocked.map((f) => api.fileLockRelock(f.id)))
          .then(() => {
            setMessage('Auto-locked: staging wiped.');
            refresh();
          })
          .catch((e) => setError(invokeErrorMessage(e)));
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [unlockDeadline, files, clearTimer, refresh]);

  const startAutoLock = (mins: number) => {
    setUnlockDeadline(Date.now() + Math.max(1, mins) * 60 * 1000);
  };

  const doLock = async (paths: string[], confirmLarge: boolean) => {
    setBusy(true);
    setError('');
    setMessage('');
    setPendingLarge(null);
    try {
      if (paths.length === 1) {
        await api.fileLockLock(paths[0], confirmLarge);
        setLockPaths('');
        setMessage('File locked. Original path now shows a GenVault stub.');
      } else {
        const result = await api.fileLockLockBatch(paths, confirmLarge);
        setLockPaths('');
        const parts = [`Locked ${result.locked.length} file(s).`];
        if (result.failed.length) {
          parts.push(
            `Failed ${result.failed.length}: ${result.failed.map((f) => f.path).join(', ')}`,
          );
          setError(result.failed.map((f) => `${f.path}: ${f.error}`).join('\n'));
        }
        setMessage(parts.join(' '));
      }
      await refresh();
    } catch (e) {
      const msg = invokeErrorMessage(e);
      if (msg.startsWith('NEEDS_LARGE_CONFIRM:')) {
        const size = Number(msg.split(':')[1] || '0');
        setPendingLarge({ paths, size });
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
      const staging = await api.fileLockUnlock(id, true);
      setMessage(`Unlocked to staging: ${staging}`);
      startAutoLock(settings.auto_lock_mins);
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!prefill) return;
    const paths = prefill.paths?.length
      ? prefill.paths
      : prefill.path
        ? [prefill.path]
        : [];
    if (paths.length) setLockPaths(paths.join('\n'));
    if (prefill.action === 'unlock' && prefill.id) {
      void handleUnlock(prefill.id).finally(() => onPrefillConsumed?.());
    } else if (prefill.action === 'lock' && paths.length) {
      void doLock(paths, false).finally(() => onPrefillConsumed?.());
    } else {
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const handleRelock = async (id: string) => {
    setBusy(true);
    try {
      await api.fileLockRelock(id);
      clearTimer();
      setMessage('Staging wiped. File locked.');
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string, name: string) => {
    if (!window.confirm(`Restore "${name}" to its original path and remove File Lock protection?`)) {
      return;
    }
    setBusy(true);
    try {
      await api.fileLockRestore(id);
      clearTimer();
      setMessage('File restored.');
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-vault-light tracking-tight flex items-center gap-3">
            <FileLock2 className="w-6 h-6 text-cyber-cyan" />
            File Lock
          </h1>
          <p className="text-sm text-vault-muted mt-1">
            Encrypt local NTFS files. Unlock decrypts to a private staging folder — not the original path.
          </p>
        </div>
        <button type="button" onClick={() => refresh()} className="p-2 rounded-lg text-vault-muted hover:text-cyber-cyan">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </motion.div>

      <GlassCard className="border-cyber-cyan/20 bg-cyber-cyan/5">
        <div className="flex gap-3 text-sm text-vault-muted">
          <AlertTriangle className="w-4 h-4 text-accent-warning flex-shrink-0 mt-0.5" />
          <p>
            One path per line for batch lock. Staging unlock is temporary; auto-lock wipes the staging copy.
          </p>
        </div>
      </GlassCard>

      {(error || message) && (
        <GlassCard className={error ? 'border-accent-danger/40' : 'border-cyber-emerald/30'}>
          <p className={cn('text-sm whitespace-pre-wrap', error ? 'text-accent-danger' : 'text-cyber-emerald')}>
            {error || message}
          </p>
        </GlassCard>
      )}

      {secondsLeft != null && (
        <GlassCard>
          <div className="flex items-center gap-2 text-sm text-accent-warning">
            <Clock className="w-4 h-4" />
            Auto-lock in {Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <FilePlus className="w-4 h-4 text-cyber-cyan" />
          <span className="text-sm font-medium text-vault-light">Lock files</span>
        </div>
        <textarea
          value={lockPaths}
          onChange={(e) => setLockPaths(e.target.value)}
          rows={3}
          placeholder={"C:\\Users\\You\\secret.pdf\nC:\\Users\\You\\notes.txt"}
          className="w-full bg-vault-dark/60 border border-vault-border/50 rounded-lg px-3 py-2 text-sm text-vault-light font-mono"
        />
        <button
          type="button"
          disabled={busy || !parsePaths(lockPaths).length}
          onClick={() => doLock(parsePaths(lockPaths), false)}
          className="mt-2 px-4 py-2 rounded-lg bg-cyber-cyan/15 text-cyber-cyan text-sm font-medium hover:bg-cyber-cyan/25 disabled:opacity-40"
        >
          Lock
        </button>
        {pendingLarge && (
          <div className="mt-3 p-3 rounded-lg border border-accent-warning/40 text-sm">
            <p className="text-accent-warning mb-2">
              File is {formatBytes(pendingLarge.size)} (over 512 MB). Continue?
            </p>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-accent-warning/20 text-accent-warning text-xs"
              onClick={() => doLock(pendingLarge.paths, true)}
            >
              Confirm lock
            </button>
          </div>
        )}
      </GlassCard>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-vault-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locked files"
            className="w-full pl-9 bg-vault-dark/60 border border-vault-border/50 rounded-lg px-3 py-2 text-sm text-vault-light"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-vault-muted">
          Auto-lock
          <select
            value={settings.auto_lock_mins}
            onChange={(e) => {
              const mins = Number(e.target.value);
              api.fileLockSettingsSet(mins).then(setSettings).catch((err) => setError(invokeErrorMessage(err)));
            }}
            className="bg-vault-dark/60 border border-vault-border/50 rounded-lg px-2 py-1.5 text-vault-light"
          >
            {[5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {loading ? (
          <GlassCard><p className="text-sm text-vault-muted">Loading…</p></GlassCard>
        ) : files.length === 0 ? (
          <GlassCard>
            <p className="text-sm text-vault-muted text-center py-6">
              No locked files yet. Paste paths above or use Explorer → Lock with GenVault.
            </p>
          </GlassCard>
        ) : (
          files.map((f) => (
            <GlassCard key={f.id}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => api.fileLockSetFavorite(f.id, !f.favorite).then(refresh)}
                      className={f.favorite ? 'text-amber-400' : 'text-vault-muted'}
                    >
                      <Star className={cn('w-4 h-4', f.favorite && 'fill-current')} />
                    </button>
                    <span className="text-sm font-medium text-vault-light truncate">{f.display_name}</span>
                    <span className={cn(
                      'text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded',
                      f.status === 'unlocked' ? 'bg-cyber-emerald/15 text-cyber-emerald' : 'bg-vault-border/40 text-vault-muted',
                    )}>
                      {f.status}
                    </span>
                  </div>
                  <p className="text-xs text-vault-muted mt-1 truncate">{f.original_path}</p>
                  <p className="text-[11px] text-vault-muted/70">{formatBytes(f.size_bytes)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {f.status === 'unlocked' ? (
                    <button type="button" disabled={busy} onClick={() => handleRelock(f.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-warning/15 text-accent-warning text-xs">
                      <Lock className="w-3.5 h-3.5" /> Lock now
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => handleUnlock(f.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-cyan/15 text-cyber-cyan text-xs">
                      <Unlock className="w-3.5 h-3.5" /> Unlock
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => handleRestore(f.id, f.display_name)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-vault-muted text-xs border border-vault-border/40">
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
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
                <span><span className="text-vault-light/80">{a.event}</span> — {a.message}</span>
                <span className="shrink-0 opacity-60">{new Date(a.timestamp * 1000).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </motion.div>
  );
}
