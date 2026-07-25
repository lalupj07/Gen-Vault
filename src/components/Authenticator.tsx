'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Check, Search, Plus, MoreVertical, Clock, Shield,
  RefreshCw, Star, Grid3X3, List, Filter, Lock
} from 'lucide-react';
import { cn, getSecondsRemaining, getTimeBasedProgress } from '@/lib/utils';
import { api, type VaultEntry } from '@/lib/api';
import { onShortcut } from '@/lib/shortcuts';
import { analyzeOtpauthUri, otpauthBlocked } from '@/lib/otpauth-safety';
import { isDemoMode } from '@/lib/demo/flag';
import QRScanner from './QRScanner';

interface AuthenticatorProps {
  entries: VaultEntry[];
}

function OTPCard({ entry, index, onFavorite }: { entry: VaultEntry; index: number; onFavorite: () => void }) {
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [copied, setCopied] = useState(false);
  const periodSec = entry.custom_period ?? entry.period ?? 30;
  const periodMs = Math.max(periodSec, 1) * 1000;
  const [seconds, setSeconds] = useState(getSecondsRemaining());
  const [progress, setProgress] = useState(getTimeBasedProgress());
  const [lastCycle, setLastCycle] = useState(Math.floor(Date.now() / periodMs));

  const fetchOtp = useCallback(async () => {
    try {
      const result = await api.generateOtp(entry.id);
      setOtp(result.code);
      setSeconds(result.seconds_remaining);
      setOtpError('');
    } catch (e) {
      setOtp('');
      setOtpError(e instanceof Error ? e.message : 'Could not generate code');
    }
  }, [entry.id]);

  useEffect(() => {
    fetchOtp();
  }, [fetchOtp]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentCycle = Math.floor(Date.now() / periodMs);
      setSeconds(getSecondsRemaining());
      setProgress(getTimeBasedProgress());
      if (currentCycle !== lastCycle) {
        fetchOtp();
        setLastCycle(currentCycle);
        import('@/lib/time-sync').then((m) => m.vibrateOnOtpExpiry()).catch(() => {});
      }
    }, 200);
    return () => clearInterval(interval);
  }, [lastCycle, fetchOtp, periodMs]);

  const handleCopy = useCallback(async () => {
    try {
      const { copySecure } = await import('@/lib/secure-clipboard');
      await copySecure(otp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [otp]);

  const formattedOtp = otp.length >= 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp;
  const isLow = seconds <= 5;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-vault-border/50 overflow-hidden card-hover group"
    >
      {/* Progress bar */}
      <div className="h-0.5 bg-vault-border/30 relative overflow-hidden">
        <motion.div
          className={cn('h-full rounded-r-full', isLow ? 'bg-accent-danger' : 'bg-cyber-cyan')}
          style={{ width: `${100 - progress}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border border-white/10"
              style={{ background: `${entry.color}20`, color: entry.color }}
            >
              {entry.icon}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-vault-light">{entry.name}</h3>
              <p className="text-[11px] text-vault-muted">{entry.issuer} • {entry.is_hotp ? 'HOTP' : 'TOTP'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onFavorite} className="p-1 rounded-lg hover:bg-white/[0.05] transition-colors">
              <Star className={cn('w-3.5 h-3.5', entry.favorite ? 'fill-accent-warning text-accent-warning' : 'text-vault-muted')} />
            </button>
            {!entry.is_hotp && (
            <span className={cn(
              'text-[10px] font-mono px-2 py-0.5 rounded-full border',
              isLow
                ? 'text-accent-danger bg-accent-danger/10 border-accent-danger/20 animate-pulse'
                : 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/20'
            )}>
              {seconds}s
            </span>
            )}
          </div>
        </div>

        {/* OTP Display */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {otpError ? (
              <p className="text-sm text-cyber-red" role="alert">{otpError}</p>
            ) : otp ? (
              <p
                className={cn(
                  'font-mono text-3xl sm:text-3xl font-bold tracking-[0.2em] tabular-nums',
                  isLow ? 'text-accent-danger' : 'text-vault-light',
                )}
              >
                {formattedOtp}
              </p>
            ) : (
              <p className="font-mono text-3xl text-vault-muted tracking-[0.2em]" aria-hidden>
                ··· ···
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!otp}
            className={cn(
              'p-2.5 rounded-xl transition-all duration-200 flex-shrink-0 disabled:opacity-40',
              copied
                ? 'bg-cyber-emerald/20 text-cyber-emerald'
                : 'bg-white/[0.03] text-vault-muted hover:text-vault-light hover:bg-white/[0.06]'
            )}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Bottom meta */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-vault-border/20">
          <span className="text-[10px] text-vault-muted flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {isDemoMode() ? 'Demo' : 'AES-256-GCM'} • {entry.digits} digits
          </span>
          <span className="text-[10px] text-vault-muted">{entry.category}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function Authenticator({ entries }: AuthenticatorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [localEntries, setLocalEntries] = useState(entries);

  useEffect(() => {
    return onShortcut((action) => {
      if (action === 'favorites') setShowFavoritesOnly(true);
    });
  }, []);

  useEffect(() => { setLocalEntries(entries); }, [entries]);

  const refresh = useCallback(async () => {
    try { setLocalEntries(await api.getVaultEntries()); } catch {}
  }, []);

  const handleScan = async (uri: string) => {
    setShowScanner(false);
    setScanError('');
    try {
      const warnings = analyzeOtpauthUri(uri);
      if (otpauthBlocked(warnings)) {
        setScanError(warnings.find((w) => w.level === 'block')?.message || 'Invalid authenticator QR');
        return;
      }
      await api.importOtpauthUri(uri, 'Imported');
      await refresh();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Could not import QR');
    }
  };

  const handleFavorite = async (id: string) => {
    try { await api.toggleEntryFavorite(id); await refresh(); } catch {}
  };

  const otpEntries = localEntries.filter((e) => e.period > 0 || e.is_hotp);
  const categories = ['All', ...new Set(otpEntries.map(e => e.category))];
  const filtered = otpEntries.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.issuer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = selectedCategory === 'All' || e.category === selectedCategory;
    const matchFavorite = !showFavoritesOnly || e.favorite;
    return matchSearch && matchCategory && matchFavorite;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-vault-light tracking-tight">Authenticator</h1>
          <p className="text-sm text-vault-muted mt-1">
            Time-based OTP generation — {otpEntries.length} {isDemoMode() ? 'demo' : 'secured'} accounts
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setScanError('');
            setShowScanner(true);
          }}
          className="flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-cyber-cyan text-black text-sm font-semibold hover:brightness-110 transition-all flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Scan QR
        </motion.button>
      </div>

      {scanError && (
        <p className="text-sm text-cyber-red" role="alert">{scanError}</p>
      )}

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
          <input
            type="text"
            placeholder="Search credentials..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-vault-border/50 text-sm text-vault-light placeholder:text-vault-muted/50 focus:outline-none focus:border-cyber-cyan/30 focus:ring-1 focus:ring-cyber-cyan/20 transition-all bg-transparent"
          />
        </div>

        <button
          onClick={() => setShowFavoritesOnly(v => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 rounded-xl glass border text-xs font-medium transition-colors',
            showFavoritesOnly
              ? 'border-accent-warning/40 text-accent-warning bg-accent-warning/10'
              : 'border-vault-border/50 text-vault-muted hover:text-vault-light'
          )}
        >
          <Star className={cn('w-3.5 h-3.5', showFavoritesOnly && 'fill-accent-warning')} />
          Favorites
        </button>

        <div className="flex items-center rounded-xl glass border border-vault-border/50 overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={cn('p-2.5 transition-colors', viewMode === 'grid' ? 'text-cyber-cyan bg-cyber-cyan/10' : 'text-vault-muted hover:text-vault-light')}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn('p-2.5 transition-colors', viewMode === 'list' ? 'text-cyber-cyan bg-cyber-cyan/10' : 'text-vault-muted hover:text-vault-light')}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border',
              selectedCategory === cat
                ? 'bg-cyber-cyan/15 text-cyber-cyan border-cyber-cyan/30'
                : 'bg-white/[0.02] text-vault-muted border-vault-border/30 hover:text-vault-light hover:bg-white/[0.04]'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* OTP Cards */}
      <div className={cn(
        viewMode === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
          : 'space-y-3'
      )}>
        <AnimatePresence mode="popLayout">
          {filtered.map((entry, i) => (
            <OTPCard key={entry.id} entry={entry} index={i} onFavorite={() => handleFavorite(entry.id)} />
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-vault-muted">
          <Shield className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No credentials found</p>
        </div>
      )}

      {showScanner && (
        <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
    </motion.div>
  );
}
