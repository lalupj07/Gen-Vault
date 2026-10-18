'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Key, Shield, AlertTriangle, Copy, Check, RefreshCw,
  Wand2, X, Command, Star, TrendingUp, Clock, Share2, LayoutTemplate
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, invokeErrorMessage } from '@/lib/api';
import { PALETTE_ACTION_MAP } from '@/lib/shortcuts';

// ===== Password Generator =====
export function PasswordGeneratorPanel() {
  const [password, setPassword] = useState('');
  const [length, setLength] = useState(16);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [strength, setStrength] = useState<[number, string]>([0, '']);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwnedCount, setPwnedCount] = useState<number | null>(null);
  const [pwnedLoading, setPwnedLoading] = useState(false);
  const [pwnedError, setPwnedError] = useState('');

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const pw = await api.generatePassword(length, upper, lower, numbers, symbols, excludeAmbiguous);
      setPassword(pw);
      const s = await api.checkPasswordStrength(pw);
      setStrength(s);
    } catch (e) {
      setPassword('');
      setStrength([0, '']);
      setPwnedError(invokeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [length, upper, lower, numbers, symbols, excludeAmbiguous]);

  useEffect(() => { generate(); }, [generate]);

  const copy = async () => {
    try {
      const { copySecure } = await import('@/lib/secure-clipboard');
      await copySecure(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const checkBreach = async () => {
    if (password.length < 8) {
      setPwnedError('Password must be at least 8 characters');
      setPwnedCount(null);
      return;
    }
    setPwnedLoading(true);
    setPwnedError('');
    try {
      setPwnedCount(await api.checkPwnedPassword(password));
    } catch (e) {
      setPwnedError(invokeErrorMessage(e));
      setPwnedCount(null);
    } finally {
      setPwnedLoading(false);
    }
  };

  const strengthColor = strength[0] >= 80 ? 'text-cyber-emerald' : strength[0] >= 50 ? 'text-accent-warning' : 'text-accent-danger';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-cyber-cyan" />
        <span className="text-sm font-medium text-vault-light">Password Generator</span>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={password}
          className="flex-1 px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm font-mono"
        />
        <button onClick={copy} className="p-2 rounded-lg bg-white/[0.03] border border-vault-border/30 text-vault-muted hover:text-vault-light">
          {copied ? <Check className="w-4 h-4 text-cyber-emerald" /> : <Copy className="w-4 h-4" />}
        </button>
        <button onClick={generate} disabled={loading} className="p-2 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/20 disabled:opacity-50">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>
      {strength[1] && (
        <div className="flex items-center justify-between text-xs">
          <span className={strengthColor}>{strength[1]}</span>
          <span className={strengthColor}>{strength[0]}/100</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={checkBreach}
          disabled={pwnedLoading || password.length < 8}
          className="px-3 py-1 rounded-lg bg-white/[0.03] border border-vault-border/30 text-vault-muted hover:text-vault-light disabled:opacity-50"
        >
          {pwnedLoading ? 'Checking HIBP...' : 'Check breach database'}
        </button>
        {pwnedCount !== null && (
          <span className={pwnedCount > 0 ? 'text-accent-danger' : 'text-cyber-emerald'}>
            {pwnedCount > 0 ? `Found in ${pwnedCount.toLocaleString()} breaches` : 'Not found in breaches'}
          </span>
        )}
        {pwnedError && <span className="text-accent-danger">{pwnedError}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="flex items-center gap-2 text-vault-muted">
          Length: {length}
          <input type="range" min={8} max={64} value={length} onChange={e => setLength(Number(e.target.value))} className="flex-1" />
        </label>
        {[
          { label: 'Uppercase', value: upper, set: setUpper },
          { label: 'Lowercase', value: lower, set: setLower },
          { label: 'Numbers', value: numbers, set: setNumbers },
          { label: 'Symbols', value: symbols, set: setSymbols },
          { label: 'Exclude ambiguous', value: excludeAmbiguous, set: setExcludeAmbiguous },
        ].map(opt => (
          <label key={opt.label} className="flex items-center gap-2 text-vault-muted cursor-pointer">
            <input type="checkbox" checked={opt.value} onChange={e => opt.set(e.target.checked)} className="accent-cyber-cyan" />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ===== Password Health =====
export function PasswordHealthPanel() {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.getPasswordHealth>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setHealth(await api.getPasswordHealth()); } catch { /* locked */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-sm text-vault-muted">Loading health data...</div>;
  if (!health) return <div className="text-sm text-vault-muted">Unlock vault to view password health.</div>;

  const metrics = [
    { label: 'Total Entries', value: health.total_entries, color: 'text-vault-light' },
    { label: 'Strong', value: health.strong_passwords, color: 'text-cyber-emerald' },
    { label: 'Weak', value: health.weak_passwords, color: 'text-accent-danger' },
    { label: 'Reused', value: health.reused_secrets, color: 'text-accent-warning' },
    { label: 'Stale', value: health.old_entries, color: 'text-vault-muted' },
    { label: 'Favorites', value: health.favorite_entries, color: 'text-cyber-cyan' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyber-emerald" />
          <span className="text-sm font-medium text-vault-light">Password Health</span>
        </div>
        <span className="text-lg font-bold text-cyber-cyan">{health.overall_score}/100</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {metrics.map(m => (
          <div key={m.label} className="p-3 rounded-xl bg-vault-black/30 border border-vault-border/20 text-center">
            <div className={cn('text-lg font-bold', m.color)}>{m.value}</div>
            <div className="text-[10px] text-vault-muted">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Security Audit =====
export function SecurityAuditPanel() {
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof api.runSecurityAudit>> | null>(null);
  const [loading, setLoading] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    try { setAudit(await api.runSecurityAudit()); } catch { /* locked */ }
    setLoading(false);
  };

  useEffect(() => { /* require explicit Re-scan — do not auto-contact HIBP */ }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-accent-warning" />
          <span className="text-sm font-medium text-vault-light">Security Audit</span>
        </div>
        <button onClick={runAudit} disabled={loading} className="text-xs px-3 py-1 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20 disabled:opacity-50">
          {loading ? 'Scanning...' : audit ? 'Re-scan' : 'Run scan'}
        </button>
      </div>
      <p className="text-[11px] text-vault-muted">
        Offline checks always run. Have I Been Pwned (if enabled in Settings) only checks password entries — never TOTP secrets or notes.
      </p>
      {audit ? (
        <>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-vault-muted">{audit.total_entries} entries scanned</span>
            <span className="font-bold text-cyber-cyan">Score: {audit.security_score}/100</span>
          </div>
          {[
            { title: 'Weak Secrets', items: audit.weak_passwords, color: 'text-accent-danger' },
            { title: 'Reused Secrets', items: audit.reused_secrets, color: 'text-accent-warning' },
            { title: 'Stale Entries', items: audit.old_entries, color: 'text-vault-muted' },
            { title: 'Breached Credentials', items: audit.compromised_credentials, color: 'text-accent-danger' },
          ].map(section => (
            <div key={section.title}>
              <div className={cn('text-xs font-medium mb-1', section.color)}>{section.title} ({section.items.length})</div>
              {section.items.length === 0 ? (
                <div className="text-[11px] text-cyber-emerald">None found</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {section.items.map(item => (
                    <span key={item} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.03] border border-vault-border/30 text-vault-muted">{item}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {audit.hibp_check_performed && (
            <div className="text-[11px] text-vault-muted">
              {audit.hibp_error
                ? `HIBP check incomplete: ${audit.hibp_error}`
                : 'Breach check via Have I Been Pwned (k-anonymity)'}
            </div>
          )}
          {!audit.hibp_check_performed && (
            <div className="text-[11px] text-vault-muted">HIBP breach checks disabled in Settings</div>
          )}
        </>
      ) : (
        <div className="text-sm text-vault-muted">Tap “Run scan” to audit this vault.</div>
      )}
    </div>
  );
}

// ===== Emergency Codes =====
export function EmergencyCodesPanel() {
  const [hasCodes, setHasCodes] = useState(false);
  const [unused, setUnused] = useState(0);
  const [generated, setGenerated] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setHasCodes(await api.hasEmergencyCodes());
      const codes = await api.getEmergencyCodes();
      setUnused(codes.filter(([used]) => !used).length);
    } catch { /* locked */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const codes = await api.generateEmergencyCodes(10);
      setGenerated(codes);
      await refresh();
    } catch (e) {
      setError(invokeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    try {
      const { copySecure } = await import('@/lib/secure-clipboard');
      await copySecure(generated.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-cyber-purple" />
          <span className="text-sm font-medium text-vault-light">Emergency Access Codes</span>
        </div>
        <span className="text-xs text-vault-muted">{unused} unused</span>
      </div>
      {generated.length > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {generated.map(code => (
              <div key={code} className="px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/30 font-mono text-xs text-vault-light text-center">{code}</div>
            ))}
          </div>
          <p className="text-[11px] text-accent-warning">Save these codes offline. Each works once only.</p>
          <button onClick={copyAll} className="w-full py-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs border border-cyber-cyan/20">
            {copied ? 'Copied!' : 'Copy All Codes'}
          </button>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-xs text-vault-muted mb-3">
            {hasCodes ? 'Emergency codes are enrolled. Regenerating invalidates old codes.' : 'Generate one-time codes for vault emergency access.'}
          </p>
          <button onClick={generate} disabled={loading} className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyber-cyan to-cyber-purple text-vault-black text-xs font-medium disabled:opacity-50">
            {loading ? 'Generating...' : hasCodes ? 'Regenerate Codes' : 'Generate Codes'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-accent-danger">{error}</p>}
    </div>
  );
}

// ===== Usage Statistics =====
export function UsageStatisticsPanel() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.getUsageStatistics>> | null>(null);

  useEffect(() => {
    (async () => {
      try { setStats(await api.getUsageStatistics()); } catch { /* locked */ }
    })();
  }, []);

  if (!stats) return <div className="text-sm text-vault-muted">Unlock vault to view statistics.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-cyber-blue" />
        <span className="text-sm font-medium text-vault-light">Usage Statistics</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-vault-black/30 border border-vault-border/20">
          <div className="text-lg font-bold text-vault-light">{stats.total_logins}</div>
          <div className="text-vault-muted">Total Logins</div>
        </div>
        <div className="p-3 rounded-xl bg-vault-black/30 border border-vault-border/20">
          <div className="text-lg font-bold text-cyber-cyan">{stats.average_daily_usage.toFixed(1)}</div>
          <div className="text-vault-muted">Avg Daily Usage</div>
        </div>
      </div>
      {stats.most_used_entries.length > 0 && (
        <div>
          <div className="text-xs text-vault-muted mb-2">Most Used Entries</div>
          {stats.most_used_entries.slice(0, 5).map(([name, count]) => (
            <div key={name} className="flex justify-between text-xs py-1 border-b border-vault-border/10">
              <span className="text-vault-light">{name}</span>
              <span className="text-cyber-cyan">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Command Palette =====
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onAction?: (actionId: string) => void;
}

export function CommandPalette({ open, onClose, onNavigate, onAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.getCommandPaletteItems>>>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    api.getCommandPaletteItems().then(setItems).catch(() => setItems([]));
  }, [open]);

  const filtered = items.filter(item =>
    !query || item.name.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  const execute = useCallback((id: string) => {
    if (Object.prototype.hasOwnProperty.call(PALETTE_ACTION_MAP, id)) {
      onAction?.(id);
    } else {
      onNavigate(id);
    }
    onClose();
  }, [onAction, onNavigate, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && filtered[selected]) execute(filtered[selected].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, selected, onClose, execute]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-vault-black/80" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-vault-dark border border-vault-border/50 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-vault-border/30">
              <Command className="w-4 h-4 text-cyber-cyan" />
              <input
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(0); }}
                placeholder="Search commands..."
                className="flex-1 bg-transparent text-sm text-vault-light placeholder:text-vault-muted outline-none"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-vault-muted border border-vault-border/30">ESC</kbd>
            </div>
            <div className="max-h-72 overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-vault-muted">No commands found</div>
              ) : filtered.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => execute(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    i === selected ? 'bg-cyber-cyan/10' : 'hover:bg-white/[0.03]'
                  )}
                >
                  <div className="flex-1">
                    <div className="text-sm text-vault-light">{item.name}</div>
                    <div className="text-[11px] text-vault-muted">{item.description}</div>
                  </div>
                  {item.shortcut && (
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-vault-muted border border-vault-border/30">{item.shortcut}</kbd>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ===== Entry History =====
export function EntryHistoryPanel({ entryId }: { entryId?: string }) {
  const [records, setRecords] = useState<Awaited<ReturnType<typeof api.getEntryHistory>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRecords(await api.getEntryHistory(entryId, 50)); } catch { setRecords([]); }
      setLoading(false);
    })();
  }, [entryId]);

  if (loading) return <div className="text-sm text-vault-muted">Loading history...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-cyber-purple" />
        <span className="text-sm font-medium text-vault-light">Entry History</span>
        <span className="text-[10px] text-vault-muted ml-auto">{records.length} events</span>
      </div>
      {records.length === 0 ? (
        <p className="text-xs text-vault-muted text-center py-4">No history recorded yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {records.map(r => (
            <div key={r.id} className="flex items-start gap-2 p-2 rounded-lg bg-vault-black/30 border border-vault-border/20 text-[11px]">
              <span className="text-cyber-cyan font-medium uppercase w-16 shrink-0">{r.action}</span>
              <div className="flex-1 min-w-0">
                <div className="text-vault-light truncate">{r.entry_name}</div>
                {r.field && (
                  <div className="text-vault-muted truncate">
                    {r.field}: {r.old_value || '—'} → {r.new_value || '—'}
                  </div>
                )}
              </div>
              <span className="text-vault-muted shrink-0">
                {new Date(r.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Vault Sharing =====
export function VaultSharePanel({ selectedIds, onClearSelection }: { selectedIds: string[]; onClearSelection?: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [expiresHours, setExpiresHours] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importPayload, setImportPayload] = useState('');
  const [sharePayload, setSharePayload] = useState('');
  const [shares, setShares] = useState<Awaited<ReturnType<typeof api.getVaultShares>>>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshShares = useCallback(async () => {
    try { setShares(await api.getVaultShares()); } catch { setShares([]); }
  }, []);

  useEffect(() => { refreshShares(); }, [refreshShares]);

  const handleCreate = async () => {
    if (selectedIds.length === 0) { setError('Select entries in the vault list first'); return; }
    if (passphrase.length < 12) { setError('Passphrase must be at least 12 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const exp = expiresHours ? parseInt(expiresHours, 10) : undefined;
      const result = await api.createVaultShare(selectedIds, passphrase, exp);
      setSharePayload(result.payload);
      setSuccess(`Share created for ${result.entry_count} entries. Copy the payload below.`);
      setPassphrase('');
      onClearSelection?.();
      await refreshShares();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create share');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (importPassphrase.length < 12 || !importPayload.trim()) {
      setError('Passphrase and payload are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const count = await api.importVaultShare(importPassphrase, importPayload.trim());
      setSuccess(`Imported ${count} shared entries.`);
      setImportPayload('');
      setImportPassphrase('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const copyPayload = async () => {
    const { copySecure } = await import('@/lib/secure-clipboard');
    await copySecure(sharePayload);
    setSuccess('Share payload copied to clipboard');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Share2 className="w-4 h-4 text-cyber-cyan" />
        <span className="text-sm font-medium text-vault-light">Vault Sharing</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs text-vault-muted">Export selected entries ({selectedIds.length})</p>
          <input type="password" placeholder="Share passphrase" value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-xs text-vault-light" />
          <input type="number" placeholder="Expires in hours (optional)" value={expiresHours}
            onChange={e => setExpiresHours(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-xs text-vault-light" />
          <button onClick={handleCreate} disabled={loading}
            className="w-full py-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs border border-cyber-cyan/20 disabled:opacity-50">
            Create Encrypted Share
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-vault-muted">Import shared entries</p>
          <input type="password" placeholder="Share passphrase" value={importPassphrase}
            onChange={e => setImportPassphrase(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-xs text-vault-light" />
          <textarea placeholder="Paste share payload" value={importPayload}
            onChange={e => setImportPayload(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-xs font-mono text-vault-light resize-none" />
          <button onClick={handleImport} disabled={loading}
            className="w-full py-2 rounded-lg bg-cyber-emerald/10 text-cyber-emerald text-xs border border-cyber-emerald/20 disabled:opacity-50">
            Import Share
          </button>
        </div>
      </div>

      {sharePayload && (
        <div className="space-y-2">
          <textarea readOnly value={sharePayload} rows={2}
            className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-[10px] font-mono text-vault-muted resize-none" />
          <button onClick={copyPayload} className="text-xs text-cyber-cyan hover:underline">Copy payload</button>
        </div>
      )}

      {shares.length > 0 && (
        <div>
          <p className="text-xs text-vault-muted mb-2">Your shares</p>
          {shares.map(s => (
            <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-vault-border/10 text-xs">
              <span className="text-vault-light truncate">{s.entry_names.join(', ')}</span>
              <div className="flex items-center gap-2 shrink-0">
                {s.revoked && <span className="text-accent-danger">Revoked</span>}
                {s.expired && !s.revoked && <span className="text-accent-warning">Expired</span>}
                {!s.revoked && !s.expired && (
                  <button onClick={() => api.revokeVaultShare(s.id).then(refreshShares)}
                    className="text-accent-danger hover:underline">Revoke</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-accent-danger">{error}</p>}
      {success && <p className="text-xs text-cyber-emerald">{success}</p>}
    </div>
  );
}

// ===== Entry Templates =====
interface EntryTemplatesPanelProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function EntryTemplatesPanel({ open, onClose, onCreated }: EntryTemplatesPanelProps) {
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof api.getTemplates>>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSecret('');
    setAutoGenerate(true);
    setError('');
    setSearch('');
    api.getTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [open]);

  const filtered = templates.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase()) ||
    t.issuer.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTemplate = templates.find(t => t.id === selected);

  const handleCreate = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      await api.createEntryFromTemplate(selected, autoGenerate ? undefined : secret);
      onCreated?.();
      onClose();
    } catch (e) {
      setError(invokeErrorMessage(e));
    }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-vault-black/80 p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[85vh] overflow-hidden bg-vault-dark border border-vault-border/50 rounded-2xl shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-vault-border/30">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-cyber-cyan" />
              <span className="text-sm font-medium text-vault-light">Entry Templates</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-vault-muted hover:text-vault-light">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 border-b border-vault-border/20">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-sm text-vault-light outline-none focus:border-cyber-cyan/40"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2">
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                  selected === t.id
                    ? 'border-cyber-cyan/40 bg-cyber-cyan/10'
                    : 'border-vault-border/30 bg-white/[0.02] hover:bg-white/[0.04]'
                )}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border border-white/10 shrink-0"
                  style={{ background: `${t.color}15`, color: t.color }}>
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-vault-light truncate">{t.name}</div>
                  <div className="text-[10px] text-vault-muted truncate">{t.category} • {t.period}s / {t.digits} digits</div>
                </div>
              </button>
            ))}
          </div>

          {selectedTemplate && (
            <div className="p-4 border-t border-vault-border/20 space-y-3">
              <div className="text-xs text-vault-muted">
                Creating <span className="text-vault-light">{selectedTemplate.name}</span> — paste the base32 secret from the service, or auto-generate for testing.
              </div>
              <label className="flex items-center gap-2 text-xs text-vault-muted cursor-pointer">
                <input type="checkbox" checked={autoGenerate} onChange={e => setAutoGenerate(e.target.checked)} className="accent-cyber-cyan" />
                Auto-generate secret
              </label>
              {!autoGenerate && (
                <input
                  value={secret}
                  onChange={e => setSecret(e.target.value)}
                  placeholder="Base32 TOTP secret"
                  className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-sm text-vault-light font-mono outline-none focus:border-cyber-cyan/40"
                />
              )}
              {error && <p className="text-xs text-accent-danger">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={loading || (!autoGenerate && secret.trim().length < 8)}
                className="w-full py-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs font-medium border border-cyber-cyan/20 hover:bg-cyber-cyan/20 disabled:opacity-50"
              >
                {loading ? 'Creating...' : `Add ${selectedTemplate.name}`}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
