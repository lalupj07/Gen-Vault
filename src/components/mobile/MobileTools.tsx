'use client';

import { useEffect, useState } from 'react';
import {
  Wand2, Shield, AlertTriangle, LayoutTemplate, Key,
  ChevronRight, Download, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, invokeErrorMessage } from '@/lib/api';
import {
  PasswordGeneratorPanel,
  PasswordHealthPanel,
  SecurityAuditPanel,
  EmergencyCodesPanel,
} from '@/components/FeatureTools';
import MobileImport from './MobileImport';
import MobileTimeSync from './MobileTimeSync';

export type MobileToolId =
  | 'generator'
  | 'health'
  | 'audit'
  | 'templates'
  | 'emergency'
  | 'import'
  | 'timesync';

const TOOLS: {
  id: MobileToolId;
  label: string;
  desc: string;
  icon: typeof Wand2;
}[] = [
  { id: 'generator', label: 'Password generator', desc: 'Strong passwords + breach check', icon: Wand2 },
  { id: 'health', label: 'Password health', desc: 'Strong, weak, reused, stale', icon: Shield },
  { id: 'audit', label: 'Security audit', desc: 'Scan vault for risks', icon: AlertTriangle },
  { id: 'import', label: 'Import authenticators', desc: 'otpauth / Google / Authy / Aegis + phishing check', icon: Download },
  { id: 'timesync', label: 'Time sync checker', desc: 'Verify clock for TOTP', icon: Clock },
  { id: 'templates', label: 'Entry templates', desc: 'Add from common services', icon: LayoutTemplate },
  { id: 'emergency', label: 'Emergency codes', desc: 'One-time vault access codes', icon: Key },
];


interface HubProps {
  onOpen: (id: MobileToolId) => void;
}

export function MobileToolsHub({ onOpen }: HubProps) {
  return (
    <div className="space-y-4 pt-2 pb-4">
      <div>
        <h2 className="m3-title-lg">Quick tools</h2>
        <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-1">
          Same security utilities as Windows — tuned for touch.
        </p>
      </div>
      <div className="m3-glass overflow-hidden p-0 divide-y divide-[color:var(--md-outline-variant)]">
        {TOOLS.map(({ id, label, desc, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onOpen(id)}
            className="w-full flex items-center gap-3 min-h-[64px] px-4 text-left hover:bg-[color-mix(in_srgb,var(--md-primary)_6%,transparent)] transition-colors duration-200"
          >
            <span className="w-11 h-11 rounded-[var(--m3-radius-md)] bg-[color:var(--md-primary-container)] flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-[color:var(--md-on-primary-container)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block m3-title-md">{label}</span>
              <span className="block text-xs text-[color:var(--md-on-surface-variant)] truncate">{desc}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-[color:var(--md-on-surface-variant)] flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface ToolProps {
  id: MobileToolId;
  onCreated?: () => void;
}

export function MobileToolView({ id, onCreated }: ToolProps) {
  const title = TOOLS.find((t) => t.id === id)?.label ?? 'Tool';

  return (
    <div className="space-y-4 pt-1 pb-4">
      <h2 className="text-lg font-semibold text-vault-light">{title}</h2>
      <div className="rounded-2xl bg-vault-panel border border-vault-border p-4">
        {id === 'generator' && <PasswordGeneratorPanel />}
        {id === 'health' && <PasswordHealthPanel />}
        {id === 'audit' && <SecurityAuditPanel />}
        {id === 'emergency' && <EmergencyCodesPanel />}
        {id === 'templates' && <MobileTemplatesInline onCreated={onCreated} />}
        {id === 'import' && <MobileImport onImported={onCreated} />}
        {id === 'timesync' && <MobileTimeSync />}
      </div>
    </div>
  );
}

/** Inline templates (desktop panel is a fixed modal). */
function MobileTemplatesInline({ onCreated }: { onCreated?: () => void }) {
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof api.getTemplates>>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const filtered = templates.filter((t) =>
    !search
    || t.name.toLowerCase().includes(search.toLowerCase())
    || t.category.toLowerCase().includes(search.toLowerCase())
    || t.issuer.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedTemplate = templates.find((t) => t.id === selected);

  const handleCreate = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    setMsg('');
    try {
      await api.createEntryFromTemplate(selected, autoGenerate ? undefined : secret);
      setMsg(`Added ${selectedTemplate?.name ?? 'entry'}`);
      setSelected(null);
      setSecret('');
      onCreated?.();
    } catch (e) {
      setError(invokeErrorMessage(e));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search templates…"
        className="w-full min-h-[44px] px-3 rounded-xl bg-vault-black border border-vault-border text-sm text-vault-light outline-none focus-visible:ring-2 focus-visible:ring-cyber-cyan/50"
      />
      <div className="max-h-[40vh] overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-vault-muted py-4 text-center">No templates found</p>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              className={cn(
                'w-full flex items-center gap-3 min-h-[52px] p-3 rounded-xl border text-left transition-colors',
                selected === t.id
                  ? 'border-cyber-cyan/40 bg-cyber-cyan/10'
                  : 'border-vault-border/40 bg-vault-black/40',
              )}
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border border-white/10 shrink-0"
                style={{ background: `${t.color}15`, color: t.color }}
              >
                {t.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-vault-light truncate">{t.name}</span>
                <span className="block text-[10px] text-vault-muted truncate">
                  {t.category} · {t.period}s / {t.digits} digits
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      {selectedTemplate && (
        <div className="space-y-3 pt-2 border-t border-vault-border">
          <p className="text-xs text-vault-muted">
            Creating <span className="text-vault-light">{selectedTemplate.name}</span>
          </p>
          <label className="flex items-center gap-2 min-h-[44px] text-xs text-vault-muted">
            <input
              type="checkbox"
              checked={autoGenerate}
              onChange={(e) => setAutoGenerate(e.target.checked)}
              className="accent-cyber-cyan w-4 h-4"
            />
            Auto-generate secret
          </label>
          {!autoGenerate && (
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Base32 TOTP secret"
              className="w-full min-h-[44px] px-3 rounded-xl bg-vault-black border border-vault-border text-sm text-vault-light font-mono outline-none"
            />
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || (!autoGenerate && secret.trim().length < 8)}
            className="w-full min-h-[48px] rounded-2xl bg-cyber-cyan text-black text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Creating…' : `Add ${selectedTemplate.name}`}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-accent-danger">{error}</p>}
      {msg && <p className="text-xs text-cyber-emerald">{msg}</p>}
    </div>
  );
}

export function toolTitle(id: MobileToolId): string {
  return TOOLS.find((t) => t.id === id)?.label ?? 'Tool';
}
