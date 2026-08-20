'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Images, Lock, Search, Star, RefreshCw, AlertTriangle, Clock,
  Upload, Eye, Trash2, Download, Film, FileText, ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { promptMasterPassword } from '@/lib/prompt-master-password';
import {
  api,
  invokeErrorMessage,
  type MediaItem,
  type MediaVaultActivity,
  type MediaVaultSettings,
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

function filePathsFromFileList(files: FileList | File[]): string[] {
  const paths: string[] = [];
  for (const f of Array.from(files)) {
    const p = (f as File & { path?: string }).path;
    if (p) paths.push(p);
  }
  return paths;
}

async function pickSavePath(defaultName: string): Promise<string | null> {
  const fallback = window.prompt('Save exported file to path:', defaultName);
  return fallback?.trim() || null;
}

function mimeIcon(mime: string) {
  if (mime.startsWith('video/')) return Film;
  if (mime === 'application/pdf') return FileText;
  return ImageIcon;
}

export default function MediaVaultView() {
  const { vaultLocked } = useAuth();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activity, setActivity] = useState<MediaVaultActivity[]>([]);
  const [settings, setSettings] = useState<MediaVaultSettings>({ auto_lock_mins: 15 });
  const [query, setQuery] = useState('');
  const [albumFilter, setAlbumFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [importPaths, setImportPaths] = useState('');
  const [deleteOriginal, setDeleteOriginal] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingLarge, setPendingLarge] = useState<{ paths: string[]; size: number } | null>(null);
  const [unlockDeadline, setUnlockDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbUrlsRef = useRef<Record<string, string>>({});

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setUnlockDeadline(null);
    setSecondsLeft(null);
  }, []);

  const revokeThumbs = useCallback((urls: Record<string, string>) => {
    Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const loadThumbs = useCallback(async (list: MediaItem[]) => {
    if (vaultLocked) return;
    revokeThumbs(thumbUrlsRef.current);
    const next: Record<string, string> = {};
    await Promise.all(
      list.map(async (it) => {
        if (!it.mime.startsWith('image/')) return;
        try {
          const b64 = await api.mediaVaultThumb(it.id);
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          next[it.id] = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        } catch {
          // thumb missing or decrypt failed — generic icon shown
        }
      }),
    );
    thumbUrlsRef.current = next;
    setThumbUrls(next);
  }, [vaultLocked, revokeThumbs]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = query.trim()
        ? await api.mediaVaultSearch(query.trim())
        : await api.mediaVaultList();
      setItems(list);
      setActivity(await api.mediaVaultActivity(30));
      setSettings(await api.mediaVaultSettingsGet());
      if (!list.some((f) => f.status === 'viewing')) clearTimer();
      if (!vaultLocked) await loadThumbs(list);
      else {
        revokeThumbs(thumbUrlsRef.current);
        thumbUrlsRef.current = {};
        setThumbUrls({});
      }
    } catch (e) {
      setError(invokeErrorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query, clearTimer, vaultLocked, loadThumbs, revokeThumbs]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => {
    clearTimer();
    revokeThumbs(thumbUrlsRef.current);
  }, [clearTimer, revokeThumbs]);

  useEffect(() => {
    if (!unlockDeadline) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((unlockDeadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearTimer();
        api.mediaVaultRelockAll()
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
  }, [unlockDeadline, clearTimer, refresh]);

  const startAutoLock = (mins: number) => {
    setUnlockDeadline(Date.now() + Math.max(1, mins) * 60 * 1000);
  };

  const doImport = async (paths: string[], confirmLarge: boolean) => {
    if (!paths.length) return;
    if (deleteOriginal) {
      const ok = window.confirm(
        `Import ${paths.length} file(s) into Media Vault?\n\nOriginal files will be removed from disk after encryption.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    setPendingLarge(null);
    try {
      if (paths.length === 1) {
        await api.mediaVaultImport(paths[0], deleteOriginal, confirmLarge);
        setImportPaths('');
        setMessage('File imported into Media Vault.');
      } else {
        const result = await api.mediaVaultImportBatch(paths, deleteOriginal, confirmLarge);
        setImportPaths('');
        const parts = [`Imported ${result.imported.length} file(s).`];
        if (result.failed.length) {
          parts.push(`Failed ${result.failed.length}.`);
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

  const handleView = async (id: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const staging = await api.mediaVaultView(id);
      setMessage(`Opened from staging: ${staging}`);
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
    try {
      await api.mediaVaultRelock(id);
      clearTimer();
      setMessage('Staging wiped.');
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (it: MediaItem) => {
    if (!window.confirm(`Permanently delete "${it.title}" from Media Vault? Export first if you need a copy.`)) {
      return;
    }
    setBusy(true);
    try {
      await api.mediaVaultDelete(it.id);
      setMessage('Item deleted.');
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (it: MediaItem) => {
    const password = await promptMasterPassword('Enter master password to export this file:');
    if (!password) return;
    const dest = await pickSavePath(it.original_name);
    if (!dest) return;
    setBusy(true);
    setError('');
    try {
      await api.mediaVaultExport(it.id, dest, password);
      setMessage(`Exported to ${dest}`);
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const paths = filePathsFromFileList(e.dataTransfer.files);
    if (paths.length) void doImport(paths, false);
    else setError('Drop failed — use Browse or paste full file paths below.');
  };

  const albums = [...new Set(items.map((i) => i.album).filter(Boolean))].sort();
  const filtered = items.filter((it) => {
    if (favoritesOnly && !it.favorite) return false;
    if (albumFilter && it.album !== albumFilter) return false;
    return true;
  });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-vault-light tracking-tight flex items-center gap-3">
            <Images className="w-6 h-6 text-cyber-cyan" />
            Media Vault
          </h1>
          <p className="text-sm text-vault-muted mt-1">
            Encrypted gallery for photos, videos, and PDFs — stored on this device only.
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
            Import copies files into encrypted storage. View opens a temporary staging copy — auto-lock wipes it.
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
            Viewing — auto-lock in {Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <Upload className="w-4 h-4 text-cyber-cyan" />
          <span className="text-sm font-medium text-vault-light">Import media</span>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
            dragOver ? 'border-cyber-cyan bg-cyber-cyan/10' : 'border-vault-border/50',
          )}
        >
          <p className="text-sm text-vault-muted mb-3">Drag files here or browse</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.gif,.heic,.mp4,.webm,.mov,.pdf,image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const paths = e.target.files ? filePathsFromFileList(e.target.files) : [];
              if (paths.length) void doImport(paths, false);
              else if (e.target.files?.length) {
                setError('Could not read file paths — paste full paths below.');
              }
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg bg-cyber-cyan/15 text-cyber-cyan text-sm font-medium hover:bg-cyber-cyan/25 disabled:opacity-40"
          >
            Browse files
          </button>
        </div>
        <textarea
          value={importPaths}
          onChange={(e) => setImportPaths(e.target.value)}
          rows={2}
          placeholder={'C:\\Users\\You\\photo.jpg\nC:\\Users\\You\\scan.pdf'}
          className="mt-3 w-full bg-vault-dark/60 border border-vault-border/50 rounded-lg px-3 py-2 text-sm text-vault-light font-mono"
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-vault-muted cursor-pointer">
          <input
            type="checkbox"
            checked={deleteOriginal}
            onChange={(e) => setDeleteOriginal(e.target.checked)}
            className="rounded border-vault-border/50"
          />
          Remove original files after successful import
        </label>
        <button
          type="button"
          disabled={busy || !parsePaths(importPaths).length}
          onClick={() => doImport(parsePaths(importPaths), false)}
          className="mt-2 px-4 py-2 rounded-lg bg-cyber-cyan/15 text-cyber-cyan text-sm font-medium hover:bg-cyber-cyan/25 disabled:opacity-40"
        >
          Import paths
        </button>
        {pendingLarge && (
          <div className="mt-3 p-3 rounded-lg border border-accent-warning/40 text-sm">
            <p className="text-accent-warning mb-2">
              File is {formatBytes(pendingLarge.size)} (over 256 MB). Continue?
            </p>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-accent-warning/20 text-accent-warning text-xs"
              onClick={() => doImport(pendingLarge.paths, true)}
            >
              Confirm import
            </button>
          </div>
        )}
      </GlassCard>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-vault-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or album"
            className="w-full pl-9 bg-vault-dark/60 border border-vault-border/50 rounded-lg px-3 py-2 text-sm text-vault-light"
          />
        </div>
        <select
          value={albumFilter}
          onChange={(e) => setAlbumFilter(e.target.value)}
          className="bg-vault-dark/60 border border-vault-border/50 rounded-lg px-3 py-2 text-sm text-vault-light"
        >
          <option value="">All albums</option>
          {albums.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border',
            favoritesOnly
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-400'
              : 'border-vault-border/50 text-vault-muted hover:text-vault-light',
          )}
        >
          <Star className={cn('w-4 h-4', favoritesOnly && 'fill-current')} />
          Favorites
        </button>
        <label className="flex items-center gap-2 text-xs text-vault-muted">
          Auto-lock
          <select
            value={settings.auto_lock_mins}
            onChange={(e) => {
              const mins = Number(e.target.value);
              api.mediaVaultSettingsSet(mins).then(setSettings).catch((err) => setError(invokeErrorMessage(err)));
            }}
            className="bg-vault-dark/60 border border-vault-border/50 rounded-lg px-2 py-1.5 text-vault-light"
          >
            {[5, 10, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <GlassCard><p className="text-sm text-vault-muted">Loading…</p></GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-vault-muted text-center py-8">
            {items.length === 0
              ? 'Import photos, videos, or PDFs — stored encrypted on this device only.'
              : 'No items match the current filters.'}
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((it) => {
            const Icon = mimeIcon(it.mime);
            const thumb = thumbUrls[it.id];
            const blurred = vaultLocked || !thumb;
            return (
              <GlassCard key={it.id} className="p-3 !rounded-xl">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-vault-dark/60 mb-2">
                  {thumb && !vaultLocked ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className={cn('w-full h-full object-cover', blurred && 'blur-xl')} />
                  ) : (
                    <div className={cn('w-full h-full flex items-center justify-center blur-sm', blurred && 'blur-xl')}>
                      <Icon className="w-10 h-10 text-vault-muted/50" />
                    </div>
                  )}
                  {(vaultLocked || blurred) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-vault-black/40">
                      <Lock className="w-6 h-6 text-vault-light/80" />
                    </div>
                  )}
                  {it.status === 'viewing' && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] uppercase px-1.5 py-0.5 rounded bg-cyber-emerald/20 text-cyber-emerald">
                      viewing
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => api.mediaVaultSetFavorite(it.id, !it.favorite).then(refresh)}
                    className={cn(
                      'absolute top-1.5 left-1.5 p-1 rounded-md bg-vault-black/50',
                      it.favorite ? 'text-amber-400' : 'text-vault-muted',
                    )}
                  >
                    <Star className={cn('w-3.5 h-3.5', it.favorite && 'fill-current')} />
                  </button>
                </div>
                <p className="text-xs font-medium text-vault-light truncate" title={it.title}>{it.title}</p>
                <p className="text-[10px] text-vault-muted truncate">{it.album || it.mime}</p>
                <p className="text-[10px] text-vault-muted/70">{formatBytes(it.size_bytes)}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {it.status === 'viewing' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRelock(it.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent-warning/15 text-accent-warning text-[10px]"
                    >
                      <Lock className="w-3 h-3" /> Lock
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || vaultLocked}
                      onClick={() => handleView(it.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyber-cyan/15 text-cyber-cyan text-[10px] disabled:opacity-40"
                    >
                      <Eye className="w-3 h-3" /> View
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleExport(it)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-vault-muted text-[10px] border border-vault-border/40"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(it)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-accent-danger/80 text-[10px] border border-accent-danger/20"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <GlassCard>
        <h2 className="text-sm font-medium text-vault-light mb-3">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="text-xs text-vault-muted">No activity yet.</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {activity.map((a) => (
              <li key={a.id} className="text-xs text-vault-muted flex justify-between gap-2">
                <span><span className="text-vault-light/80">{a.action}</span> — {a.detail}</span>
                <span className="shrink-0 opacity-60">{new Date(a.ts * 1000).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </motion.div>
  );
}
