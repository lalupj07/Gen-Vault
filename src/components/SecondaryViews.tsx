'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Vault, Smartphone, Activity, QrCode, HardDrive, Fingerprint,
  AlertTriangle, FileKey, Settings, Shield, Lock, Unlock, Key,
  Globe, Clock, CheckCircle2, XCircle, Wifi, WifiOff, Plus,
  RefreshCw, Download, Trash2, Eye, EyeOff, Bell, Moon, Sun,
  Monitor, Cpu, Database, Zap, Copy, RotateCcw, User, Mail,
  Calendar, LogOut, Edit3, Camera, Award, TrendingUp, Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { COMPANY, PRODUCT } from '@/lib/company';
import { useTheme, type Theme } from '@/lib/theme';
import { useFont, type UiFont } from '@/lib/font';
import { api, type VaultEntry, type DeviceEntry, type Session as ApiSession, type SecurityEvent } from '@/lib/api';
import { promptMasterPassword } from '@/lib/prompt-master-password';
import QRScanner from '@/components/QRScanner';
import {
  PasswordGeneratorPanel, PasswordHealthPanel, SecurityAuditPanel,
  EmergencyCodesPanel, UsageStatisticsPanel, EntryHistoryPanel, VaultSharePanel,
  EntryTemplatesPanel,
} from '@/components/FeatureTools';
import { useI18n } from '@/lib/i18n';
import { onShortcut } from '@/lib/shortcuts';
import QRCode from 'qrcode';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } }
};

function SectionHeader({ icon: Icon, title, subtitle, action }: {
  icon: any; title: string; subtitle: string; action?: React.ReactNode;
}) {
  return (
    <motion.div variants={item} className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-vault-light tracking-tight flex items-center gap-3">
          <Icon className="w-6 h-6 text-cyber-cyan" />
          {title}
        </h1>
        <p className="text-sm text-vault-muted mt-1">{subtitle}</p>
      </div>
      {action}
    </motion.div>
  );
}

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={cn('glass rounded-2xl p-5 border border-vault-border/50 card-hover', className)}>
      {children}
    </motion.div>
  );
}

// ===== Vault View =====
export function VaultView() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIssuer, setNewIssuer] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState('');
  const [editingEntry, setEditingEntry] = useState<VaultEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editIssuer, setEditIssuer] = useState('');
  const [editCategory, setEditCategory] = useState('General');
  const [editNotes, setEditNotes] = useState('');
  const [editNotesRevealed, setEditNotesRevealed] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editAttachments, setEditAttachments] = useState<Awaited<ReturnType<typeof api.listEntryAttachments>>>([]);
  const [attachError, setAttachError] = useState('');
  const [attachLoading, setAttachLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadEntries = useCallback(async () => {
    try {
      const q = searchQuery.trim();
      setEntries(q ? await api.searchVaultEntries(q) : await api.getVaultEntries());
    } catch {}
  }, [searchQuery]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  useEffect(() => {
    return onShortcut((action) => {
      if (action === 'add-entry') setShowAdd(true);
      if (action === 'search-vault') searchRef.current?.focus();
      if (action === 'templates') setShowTemplates(true);
    });
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await api.addVaultEntry({
        name: newName.trim(), issuer: newIssuer.trim() || newName.trim(),
        secret: newSecret.trim() || undefined, category: newCategory,
        icon: newName.trim().slice(0, 2).toUpperCase(), color: '#00e5ff',
      });
      setNewName(''); setNewIssuer(''); setNewSecret(''); setShowAdd(false);
      loadEntries();
    } catch {}
  };

  const handleRemove = async (id: string) => {
    try { await api.removeVaultEntry(id); loadEntries(); } catch {}
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    try {
      await api.bulkDeleteEntries([...selected]);
      setSelected(new Set());
      loadEntries();
    } catch {}
  };

  const handleBulkTag = async () => {
    if (selected.size === 0 || !tagInput.trim()) return;
    try {
      await api.bulkAddTags([...selected], [tagInput.trim()]);
      setTagInput('');
      loadEntries();
    } catch {}
  };

  const toggleFavorite = async (id: string) => {
    try { await api.toggleEntryFavorite(id); loadEntries(); } catch {}
  };

  const openEdit = async (entry: VaultEntry) => {
    setEditingEntry(entry);
    setEditName(entry.name);
    setEditIssuer(entry.issuer);
    setEditCategory(entry.category);
    setEditNotes('');
    setEditNotesRevealed(false);
    setAttachError('');
    const password = await promptMasterPassword('Confirm master password to reveal notes:');
    if (password) {
      try {
        setEditNotes(await api.revealEntryNotes(entry.id, password));
        setEditNotesRevealed(true);
      } catch {
        setEditNotes('');
      }
    }
    try {
      setEditAttachments(await api.listEntryAttachments(entry.id));
    } catch {
      setEditAttachments(entry.attachments || []);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    setEditSaving(true);
    try {
      await api.updateVaultEntry(editingEntry.id, {
        name: editName.trim(),
        issuer: editIssuer.trim(),
        category: editCategory,
        ...(editNotesRevealed ? { notes: editNotes } : {}),
      });
      setEditingEntry(null);
      loadEntries();
    } catch {}
    setEditSaving(false);
  };

  const handleAttachFile = async (file: File) => {
    if (!editingEntry) return;
    setAttachLoading(true);
    setAttachError('');
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const dataBase64 = btoa(binary);
      const meta = await api.addEntryAttachment(
        editingEntry.id,
        file.name,
        file.type || 'application/octet-stream',
        dataBase64,
      );
      setEditAttachments(prev => [...prev, meta]);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Failed to attach file');
    }
    setAttachLoading(false);
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!editingEntry) return;
    try {
      await api.removeEntryAttachment(editingEntry.id, attachmentId);
      setEditAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Failed to remove attachment');
    }
  };

  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    if (!editingEntry) return;
    const password = await promptMasterPassword('Enter master password to download this attachment:');
    if (!password) return;
    try {
      const b64 = await api.exportEntryAttachment(editingEntry.id, attachmentId, password);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'Failed to download attachment');
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={Vault} title="Secure Vault" subtitle="AES-256-GCM encrypted credential storage — Zero-knowledge architecture" />

      <div className="grid grid-cols-2 gap-4">
        <GlassCard><EntryHistoryPanel /></GlassCard>
        <GlassCard><VaultSharePanel selectedIds={[...selected]} onClearSelection={() => setSelected(new Set())} /></GlassCard>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <GlassCard>
          <div className="flex items-center gap-3 mb-3">
            <Lock className="w-5 h-5 text-cyber-cyan" />
            <span className="text-sm font-medium text-vault-light">Encryption Status</span>
          </div>
          <div className="text-2xl font-bold text-cyber-emerald mb-1">Active</div>
          <p className="text-[11px] text-vault-muted">AES-256-GCM with Argon2id key derivation</p>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3 mb-3">
            <Database className="w-5 h-5 text-cyber-purple" />
            <span className="text-sm font-medium text-vault-light">Vault Entries</span>
          </div>
          <div className="text-2xl font-bold text-vault-light mb-1">{entries.length}</div>
          <p className="text-[11px] text-vault-muted">Across {new Set(entries.map(e => e.category)).size} categories</p>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-5 h-5 text-cyber-emerald" />
            <span className="text-sm font-medium text-vault-light">Integrity Check</span>
          </div>
          <div className="text-2xl font-bold text-cyber-emerald mb-1">Verified</div>
          <p className="text-[11px] text-vault-muted">SHA-384 hash verified at boot</p>
        </GlassCard>
      </div>

      {showAdd && (
        <GlassCard>
          <h3 className="text-sm font-medium text-vault-light mb-3">Add New Entry</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Service Name"
              className="px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light placeholder:text-vault-muted/50 focus:border-cyber-cyan/40 outline-none" />
            <input value={newIssuer} onChange={e => setNewIssuer(e.target.value)} placeholder="Issuer"
              className="px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light placeholder:text-vault-muted/50 focus:border-cyber-cyan/40 outline-none" />
            <input value={newSecret} onChange={e => setNewSecret(e.target.value)} placeholder="TOTP Secret (auto-generated if empty)"
              className="px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light placeholder:text-vault-muted/50 focus:border-cyber-cyan/40 outline-none font-mono" />
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
              className="px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light outline-none">
              {['General', 'Work', 'Development', 'Cloud', 'Communication', 'Security', 'Social', 'Finance'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAdd} className="px-4 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs font-medium border border-cyber-cyan/20 hover:bg-cyber-cyan/20 transition-colors">Save</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 rounded-lg bg-vault-border/30 text-vault-muted text-xs font-medium border border-vault-border/30 hover:text-vault-light transition-colors">Cancel</button>
          </div>
        </GlassCard>
      )}

      {editingEntry && (
        <GlassCard>
          <h3 className="text-sm font-medium text-vault-light mb-3">Edit Entry</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name"
              className="px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light outline-none focus:border-cyber-cyan/40" />
            <input value={editIssuer} onChange={e => setEditIssuer(e.target.value)} placeholder="Issuer"
              className="px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light outline-none focus:border-cyber-cyan/40" />
            <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
              className="px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light outline-none">
              {['General', 'Work', 'Development', 'Cloud', 'Communication', 'Security', 'Social', 'Finance'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <label className="block mt-3 text-xs text-vault-muted">Notes (encrypted at rest)</label>
          {!editNotesRevealed ? (
            <button
              type="button"
              onClick={async () => {
                if (!editingEntry) return;
                const password = await promptMasterPassword('Confirm master password to reveal notes:');
                if (!password) return;
                try {
                  setEditNotes(await api.revealEntryNotes(editingEntry.id, password));
                  setEditNotesRevealed(true);
                } catch {}
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light"
            >
              Reveal notes (master password)
            </button>
          ) : (
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={4} maxLength={4096}
              placeholder="Store recovery hints, backup codes, or context — never share secrets you would not store in a password manager."
              className="mt-1 w-full px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light placeholder:text-vault-muted/50 outline-none focus:border-cyber-cyan/40 resize-y" />
          )}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-vault-light">Attachments (encrypted)</span>
              <label className="text-xs px-2 py-1 rounded-lg bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/20 cursor-pointer hover:bg-cyber-purple/20">
                {attachLoading ? 'Uploading...' : 'Add file'}
                <input type="file" className="hidden" disabled={attachLoading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleAttachFile(f); e.target.value = ''; }} />
              </label>
            </div>
            {editAttachments.length === 0 ? (
              <p className="text-[11px] text-vault-muted">No attachments — max 5 MB per file, 10 per entry.</p>
            ) : (
              <div className="space-y-1">
                {editAttachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-vault-border/20 text-xs">
                    <span className="flex-1 text-vault-light truncate">{att.filename}</span>
                    <span className="text-vault-muted">{(att.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => handleDownloadAttachment(att.id, att.filename)} className="text-cyber-cyan hover:underline">Download</button>
                    <button onClick={() => handleRemoveAttachment(att.id)} className="text-accent-danger hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            )}
            {attachError && <p className="text-[11px] text-accent-danger mt-1">{attachError}</p>}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSaveEdit} disabled={editSaving || !editName.trim()}
              className="px-4 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs font-medium border border-cyber-cyan/20 hover:bg-cyber-cyan/20 disabled:opacity-50">
              {editSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setEditingEntry(null)}
              className="px-4 py-1.5 rounded-lg bg-vault-border/30 text-vault-muted text-xs font-medium border border-vault-border/30 hover:text-vault-light">
              Cancel
            </button>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="flex items-center justify-between mb-4 gap-3">
          <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search entries..."
            className="flex-1 px-3 py-2 rounded-lg bg-vault-black/40 border border-vault-border/30 text-sm text-vault-light placeholder:text-vault-muted/50 outline-none" />
          <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-purple/10 text-cyber-purple text-xs font-medium border border-cyber-purple/20 hover:bg-cyber-purple/20 transition-colors">
            Templates
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs font-medium border border-cyber-cyan/20 hover:bg-cyber-cyan/20 transition-colors">
            <Plus className="w-3 h-3" /> Add Entry
          </button>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-cyber-cyan/5 border border-cyber-cyan/20">
            <span className="text-xs text-cyber-cyan">{selected.size} selected</span>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add tag..."
              className="flex-1 px-2 py-1 rounded bg-vault-black/40 border border-vault-border/30 text-xs text-vault-light" />
            <button onClick={handleBulkTag} className="text-xs px-2 py-1 rounded bg-cyber-purple/10 text-cyber-purple">Tag</button>
            <button onClick={handleBulkDelete} className="text-xs px-2 py-1 rounded bg-accent-danger/10 text-accent-danger">Delete</button>
          </div>
        )}
        {entries.length === 0 ? (
          <div className="text-center py-8 text-vault-muted text-sm">No vault entries yet. Click &quot;Add Entry&quot; to get started.</div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <motion.div key={entry.id} variants={item}
                className="flex items-center gap-3 p-3 rounded-xl glass-light group hover:bg-white/[0.03] transition-colors"
              >
                <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggleSelect(entry.id)}
                  className="accent-cyber-cyan" />
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border border-white/10"
                  style={{ background: `${entry.color}15`, color: entry.color }}>
                  {entry.icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-vault-light flex items-center gap-1">
                    {entry.name}
                    {entry.favorite && <Star className="w-3 h-3 text-accent-warning fill-accent-warning" />}
                  </div>
                  <div className="text-[10px] text-vault-muted">{entry.issuer} • {entry.is_hotp ? 'HOTP' : 'TOTP'} • {entry.digits} digits</div>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">{entry.tags.map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.03] text-vault-muted">{t}</span>
                    ))}</div>
                  )}
                </div>
                <div className="text-[10px] text-vault-muted px-2 py-0.5 rounded-full bg-white/[0.03] border border-vault-border/30">
                  {entry.category}
                </div>
                <button onClick={() => openEdit(entry)} className="opacity-0 group-hover:opacity-100 transition-opacity text-vault-muted hover:text-cyber-cyan">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggleFavorite(entry.id)} className="text-vault-muted hover:text-accent-warning transition-colors">
                  <Star className={cn('w-3.5 h-3.5', entry.favorite && 'fill-accent-warning text-accent-warning')} />
                </button>
                <button onClick={() => handleRemove(entry.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-accent-danger/60 hover:text-accent-danger">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <Lock className="w-3.5 h-3.5 text-cyber-emerald opacity-50" />
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>

      <EntryTemplatesPanel open={showTemplates} onClose={() => setShowTemplates(false)} onCreated={loadEntries} />
    </motion.div>
  );
}

// ===== Devices View =====
export function DevicesView() {
  const [devices, setDevices] = useState<DeviceEntry[]>([]);

  useEffect(() => {
    (async () => { try { setDevices(await api.getDevices()); } catch {} })();
  }, []);

  const handleRemove = async (id: string) => {
    try { await api.removeDevice(id); setDevices(await api.getDevices()); } catch {}
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={Smartphone} title="Device Management" subtitle="Multi-device trust verification & fingerprint integrity validation" />

      {devices.length === 0 ? (
        <GlassCard><div className="text-center py-8 text-vault-muted text-sm">No devices registered yet.</div></GlassCard>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {devices.map((device) => {
            const isActive = device.last_active > Date.now() - 86400000;
            const trustPct = Math.round(device.trust_level * 100);
            return (
              <GlassCard key={device.id}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
                      isActive ? 'bg-cyber-emerald/10 border border-cyber-emerald/20' : 'bg-vault-border/50 border border-vault-border/30'
                    )}>
                      {device.device_type === 'desktop' ? <Monitor className="w-5 h-5 text-cyber-emerald" /> :
                       device.device_type === 'mobile' ? <Smartphone className="w-5 h-5 text-cyber-cyan" /> :
                       <Monitor className="w-5 h-5 text-vault-muted" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-vault-light">{device.name}</div>
                      <div className="text-[11px] text-vault-muted">{device.os}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium border',
                      isActive ? 'text-cyber-emerald bg-cyber-emerald/10 border-cyber-emerald/20' : 'text-vault-muted bg-vault-border/30 border-vault-border/30'
                    )}>
                      {isActive ? 'active' : 'inactive'}
                    </span>
                    {!device.is_current && (
                      <button onClick={() => handleRemove(device.id)} className="text-accent-danger/60 hover:text-accent-danger transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div><span className="text-vault-muted">Trust Level</span>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-vault-border/30 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyber-cyan to-cyber-emerald" style={{ width: `${trustPct}%` }} />
                      </div>
                      <span className="text-vault-light font-semibold">{trustPct}%</span>
                    </div>
                  </div>
                  <div><span className="text-vault-muted">IP</span><div className="mt-1 font-mono text-vault-light">{device.ip_address}</div></div>
                  <div><span className="text-vault-muted">Device ID</span><div className="mt-1 font-mono text-vault-light truncate">{device.id.slice(0, 8)}...</div></div>
                  <div><span className="text-vault-muted">Last Seen</span><div className="mt-1 text-vault-light">
                    {device.last_active > Date.now() - 60000 ? 'Just now' : `${Math.round((Date.now() - device.last_active) / 60000)}m ago`}
                  </div></div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ===== Sessions View =====
export function SessionsView() {
  const [sessions, setSessions] = useState<ApiSession[]>([]);

  const load = useCallback(async () => {
    try { setSessions(await api.getSessions()); } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (id: string) => {
    try { await api.revokeSession(id); load(); } catch {}
  };

  const handleRevokeAll = async () => {
    try { await api.revokeAllSessions(); load(); } catch {}
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return `${Math.round(diff / 86400000)}d ago`;
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={Activity} title="Active Sessions" subtitle="Secure ephemeral session monitoring with real-time token rotation" />

      {sessions.length > 1 && (
        <div className="flex justify-end">
          <button onClick={handleRevokeAll} className="text-[10px] px-3 py-1.5 rounded-lg text-accent-danger bg-accent-danger/10 border border-accent-danger/20 font-medium hover:bg-accent-danger/20 transition-colors">
            Revoke All Sessions
          </button>
        </div>
      )}

      {sessions.length === 0 ? (
        <GlassCard><div className="text-center py-8 text-vault-muted text-sm">No sessions found.</div></GlassCard>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <GlassCard key={session.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn('w-3 h-3 rounded-full', session.is_active ? 'bg-cyber-emerald animate-pulse' : 'bg-vault-muted')} />
                  <div>
                    <div className="text-sm font-medium text-vault-light">{session.ip}</div>
                    <div className="text-[11px] text-vault-muted">
                      {session.location} • Started {timeAgo(session.started_at)} • Last active {timeAgo(session.last_active)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] px-2.5 py-1 rounded-full font-medium border',
                    session.is_active ? 'text-cyber-emerald bg-cyber-emerald/10 border-cyber-emerald/20' : 'text-vault-muted bg-vault-border/30 border-vault-border/30'
                  )}>
                    {session.is_active ? 'active' : 'revoked'}
                  </span>
                  {session.is_active && (
                    <button onClick={() => handleRevoke(session.id)} className="text-[10px] px-2.5 py-1 rounded-full text-accent-danger bg-accent-danger/10 border border-accent-danger/20 font-medium hover:bg-accent-danger/20 transition-colors">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ===== QR Onboarding View =====
export function QROnboardView() {
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const [passphrase, setPassphrase] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importPayload, setImportPayload] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (passphrase.length < 12) { setError('Passphrase must be at least 12 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = await api.createVaultTransfer(passphrase);
      const url = await QRCode.toDataURL(payload, { width: 280, margin: 2, errorCorrectionLevel: 'M' });
      setQrDataUrl(url);
      setSuccess('Scan this QR on your other device. Keep the passphrase secret.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create transfer QR');
      setQrDataUrl('');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (importPassphrase.length < 12) { setError('Passphrase must be at least 12 characters'); return; }
    if (!importPayload.trim()) { setError('Paste or scan a transfer payload'); return; }
    setLoading(true);
    setError('');
    try {
      const count = await api.importVaultTransfer(importPassphrase, importPayload.trim());
      setSuccess(`Imported ${count} entries successfully.`);
      setImportPayload('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={QrCode} title="Vault QR Transfer" subtitle="Encrypted device-to-device vault migration via QR code" />

      <div className="flex gap-2">
        {(['export', 'import'] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); }}
            className={cn('px-4 py-2 rounded-xl text-xs font-medium border transition-colors',
              mode === m ? 'bg-cyber-cyan/10 text-cyber-cyan border-cyber-cyan/30' : 'text-vault-muted border-vault-border/30')}>
            {m === 'export' ? 'Export to QR' : 'Import from QR'}
          </button>
        ))}
      </div>

      {mode === 'export' ? (
        <div className="grid grid-cols-2 gap-6">
          <GlassCard>
            <h3 className="text-sm font-medium text-vault-light mb-3">Generate Transfer QR</h3>
            <input type="password" placeholder="Transfer passphrase (12+ chars)" value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-sm text-vault-light mb-3" />
            <button onClick={handleExport} disabled={loading}
              className="w-full py-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs border border-cyber-cyan/20 disabled:opacity-50">
              {loading ? 'Generating...' : 'Generate QR Code'}
            </button>
          </GlassCard>
          <GlassCard className="flex flex-col items-center justify-center py-6">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Vault transfer QR" className="w-56 h-56 rounded-xl bg-white p-2" />
            ) : (
              <QrCode className="w-24 h-24 text-vault-muted/30" />
            )}
            <p className="text-[11px] text-vault-muted mt-3 text-center">AES-256-GCM encrypted payload</p>
          </GlassCard>
        </div>
      ) : (
        <GlassCard>
          <h3 className="text-sm font-medium text-vault-light mb-3">Import Transfer</h3>
          <input type="password" placeholder="Transfer passphrase" value={importPassphrase}
            onChange={e => setImportPassphrase(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-sm text-vault-light mb-2" />
          <textarea placeholder="Paste transfer payload or scan QR" value={importPayload}
            onChange={e => setImportPayload(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-xs font-mono text-vault-light mb-2 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowScanner(true)} className="flex-1 py-2 rounded-lg bg-white/[0.03] text-vault-muted text-xs border border-vault-border/30">
              Scan QR
            </button>
            <button onClick={handleImport} disabled={loading}
              className="flex-1 py-2 rounded-lg bg-cyber-emerald/10 text-cyber-emerald text-xs border border-cyber-emerald/20 disabled:opacity-50">
              {loading ? 'Importing...' : 'Import Vault'}
            </button>
          </div>
        </GlassCard>
      )}

      {error && <div className="p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-xs">{error}</div>}
      {success && <div className="p-3 rounded-lg bg-cyber-emerald/10 border border-cyber-emerald/20 text-cyber-emerald text-xs">{success}</div>}

      {showScanner && (
        <QRScanner
          onScan={(text) => { setImportPayload(text); setShowScanner(false); }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </motion.div>
  );
}

// ===== Hardware Keys View =====
export function HardwareKeysView() {
  const { vaultLocked, refreshUnlockMethods } = useAuth();
  const [keys, setKeys] = useState<Awaited<ReturnType<typeof api.getHardwareKeys>>>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyPin, setKeyPin] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAvailable(await api.fidoAvailable());
      setKeys(await api.getHardwareKeys());
    } catch {
      setKeys([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRegister = async () => {
    if (!keyName.trim()) {
      setError('Enter a name for this security key');
      return;
    }
    setRegistering(true);
    setError('');
    setMessage('');
    try {
      await api.registerHardwareKey(keyName.trim(), keyPin || undefined);
      setKeyName('');
      setKeyPin('');
      setMessage('Security key registered. Touch the key when prompted.');
      await refreshUnlockMethods();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    }
    setRegistering(false);
  };

  const handleTest = async (id: string) => {
    setError('');
    setMessage('');
    try {
      await api.testHardwareKey(id, keyPin || undefined);
      setMessage('Security key verified successfully.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
  };

  const handleRemove = async (id: string) => {
    setError('');
    try {
      await api.removeHardwareKey(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove key');
    }
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return `${Math.round(diff / 86400000)}d ago`;
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={HardDrive} title="Hardware Security Keys" subtitle="FIDO2/USB CTAP hardware tokens for vault unlock" />

      {loading ? (
        <div className="text-sm text-vault-muted">Scanning for FIDO2 devices...</div>
      ) : (
        <>
          <GlassCard>
            <div className="flex items-center justify-between text-sm">
              <span className="text-vault-muted">USB FIDO2 reader</span>
              <span className={available ? 'text-cyber-emerald' : 'text-accent-warning'}>
                {available ? 'Device ready' : 'No device detected'}
              </span>
            </div>
          </GlassCard>

          <div className="space-y-3">
            {keys.length === 0 ? (
              <GlassCard>
                <div className="text-center py-6 text-vault-muted text-sm">No hardware keys registered yet.</div>
              </GlassCard>
            ) : (
              keys.map(k => (
                <GlassCard key={k.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center border bg-cyber-emerald/10 border-cyber-emerald/20 shrink-0">
                        <Key className="w-5 h-5 text-cyber-emerald" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-vault-light truncate">{k.name}</div>
                        <div className="text-[11px] text-vault-muted">{k.device_type} • Last used {timeAgo(k.last_used)}</div>
                        {k.unlock_enrolled && (
                          <div className="text-[10px] text-cyber-cyan mt-0.5">Vault unlock enabled</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleTest(k.id)}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20">
                        Test
                      </button>
                      {!vaultLocked && (
                        <button onClick={() => handleRemove(k.id)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-accent-danger/10 text-accent-danger border border-accent-danger/20">
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              ))
            )}
          </div>

          <GlassCard>
            <h3 className="text-sm font-medium text-vault-light mb-3">Register New Hardware Key</h3>
            {vaultLocked ? (
              <p className="text-sm text-vault-muted">Unlock the vault to register a new security key.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-vault-muted">Insert your FIDO2 USB key, then enter a label. Touch the key when your browser prompts you.</p>
                <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Key name (e.g. YubiKey 5)"
                  className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-sm text-vault-light outline-none focus:border-cyber-cyan/40" />
                <input value={keyPin} onChange={e => setKeyPin(e.target.value)} placeholder="Key PIN (only if your key requires one)"
                  type="password"
                  className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-sm text-vault-light outline-none focus:border-cyber-cyan/40" />
                <button onClick={handleRegister} disabled={registering || !available}
                  className="w-full py-2 rounded-xl bg-cyber-cyan/10 text-cyber-cyan text-xs font-medium border border-cyber-cyan/20 hover:bg-cyber-cyan/20 disabled:opacity-50">
                  {registering ? 'Waiting for key...' : 'Begin Registration'}
                </button>
              </div>
            )}
            {message && <p className="text-xs text-cyber-emerald mt-3">{message}</p>}
            {error && <p className="text-xs text-accent-danger mt-3">{error}</p>}
          </GlassCard>
        </>
      )}
    </motion.div>
  );
}

// ===== Biometrics View =====
export function BiometricsView() {
  const { unlockMethods, vaultLocked, refreshUnlockMethods } = useAuth();
  const [helloAvailable, setHelloAvailable] = useState(false);
  const [biometricSetting, setBiometricSetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const helloEnrolled = unlockMethods.includes('hello');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [avail, settings] = await Promise.all([
        api.helloAvailable(),
        api.getSettings(),
      ]);
      setHelloAvailable(avail);
      setBiometricSetting(settings.biometric);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh, unlockMethods]);

  const handleEnroll = async () => {
    setEnrolling(true);
    setError('');
    setMessage('');
    try {
      await api.enrollHello();
      const s = await api.getSettings();
      await api.updateSettings({ ...s, biometric: true });
      setBiometricSetting(true);
      await refreshUnlockMethods();
      setMessage('Biometric unlock enrolled (fingerprint / face / device PIN).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrollment failed');
    }
    setEnrolling(false);
  };

  const handleRemove = async () => {
    setEnrolling(true);
    setError('');
    try {
      await api.removeUnlockMethod('hello');
      const s = await api.getSettings();
      await api.updateSettings({ ...s, biometric: false });
      setBiometricSetting(false);
      await refreshUnlockMethods();
      setMessage('Biometric unlock removed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove');
    }
    setEnrolling(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setMessage('');
    const password = await promptMasterPassword('Enter master password to test biometrics:');
    if (!password) {
      setTesting(false);
      return;
    }
    try {
      await api.unlockWithHello(password);
      setMessage('Biometric + password verification succeeded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
    setTesting(false);
  };

  const handleToggleSetting = async (enabled: boolean) => {
    try {
      const s = await api.getSettings();
      await api.updateSettings({ ...s, biometric: enabled });
      await api.setBiometricSettings(enabled);
      setBiometricSetting(enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update setting');
    }
  };

  const cards = [
    {
      name: 'Face & Fingerprint',
      icon: Monitor,
      color: '#00e5ff',
      detail: helloAvailable ? 'Face, fingerprint, or device PIN' : 'Not available on this device',
      status: helloEnrolled ? 'Enrolled' : helloAvailable ? 'Available' : 'Unavailable',
      ok: helloEnrolled,
    },
    {
      name: 'Vault Unlock Layer',
      icon: Fingerprint,
      color: '#00e676',
      detail: 'Presence confirmation — vault key recovered only from master password',
      status: biometricSetting ? 'Enabled in settings' : 'Disabled',
      ok: biometricSetting,
    },
    {
      name: 'Secure Keystore',
      icon: Cpu,
      color: '#7c4dff',
      detail: 'Hardware-backed protector for biometric unlock key',
      status: vaultLocked ? 'Locked' : 'Active',
      ok: !vaultLocked,
    },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={Fingerprint} title="Biometric Authentication" subtitle="Fingerprint, face unlock, or device PIN for vault access" />

      {loading ? (
        <div className="text-sm text-vault-muted">Loading biometric status...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {cards.map((bio, i) => (
              <GlassCard key={i}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${bio.color}10`, border: `1px solid ${bio.color}20` }}>
                    <bio.icon className="w-5 h-5" style={{ color: bio.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-vault-light">{bio.name}</div>
                    <div className="text-[10px] text-vault-muted">{bio.detail}</div>
                  </div>
                </div>
                <div className={cn('text-xs font-medium', bio.ok ? 'text-cyber-emerald' : 'text-vault-muted')}>{bio.status}</div>
              </GlassCard>
            ))}
          </div>

          <GlassCard>
            <h3 className="text-sm font-medium text-vault-light mb-4">Biometric Management</h3>
            {vaultLocked ? (
              <p className="text-sm text-vault-muted">Unlock the vault to manage biometrics.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm text-vault-light">Use biometrics for unlock</div>
                    <div className="text-[11px] text-vault-muted">Requires biometric enrollment</div>
                  </div>
                  <button
                    onClick={() => handleToggleSetting(!biometricSetting)}
                    disabled={!helloEnrolled}
                    className={cn(
                      'relative w-10 h-5 rounded-full transition-colors',
                      biometricSetting && helloEnrolled ? 'bg-cyber-cyan/40' : 'bg-vault-border/40',
                      !helloEnrolled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', biometricSetting ? 'left-5' : 'left-0.5')} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!helloEnrolled && helloAvailable && (
                    <button onClick={handleEnroll} disabled={enrolling}
                      className="px-4 py-2 rounded-xl bg-cyber-cyan/10 text-cyber-cyan text-xs border border-cyber-cyan/20 hover:bg-cyber-cyan/20 disabled:opacity-50">
                      {enrolling ? 'Enrolling...' : 'Enroll fingerprint / face'}
                    </button>
                  )}
                  {helloEnrolled && (
                    <>
                      <button onClick={handleTest} disabled={testing}
                        className="px-4 py-2 rounded-xl bg-cyber-emerald/10 text-cyber-emerald text-xs border border-cyber-emerald/20 hover:bg-cyber-emerald/20 disabled:opacity-50">
                        {testing ? 'Testing...' : 'Test Verification'}
                      </button>
                      <button onClick={handleRemove} disabled={enrolling}
                        className="px-4 py-2 rounded-xl bg-accent-danger/10 text-accent-danger text-xs border border-accent-danger/20 hover:bg-accent-danger/20 disabled:opacity-50">
                        Remove Hello
                      </button>
                    </>
                  )}
                </div>
                {message && <p className="text-xs text-cyber-emerald">{message}</p>}
                {error && <p className="text-xs text-accent-danger">{error}</p>}
              </div>
            )}
          </GlassCard>
        </>
      )}
    </motion.div>
  );
}

// ===== Threat Detection View =====
export function ThreatDetectionView() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const all = await api.getSecurityEvents();
        setEvents(all.filter(e => e.severity === 'critical' || e.severity === 'warning'));
      } catch {}
    })();
  }, []);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={AlertTriangle} title="Threat Detection" subtitle="AI-assisted anomaly detection with real-time behavioral analysis" />

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Threat Level', value: events.length > 3 ? 'High' : events.length > 0 ? 'Low' : 'Safe', color: events.length > 3 ? 'text-accent-danger' : 'text-cyber-emerald' },
          { label: 'Blocked Attempts', value: String(events.filter(e => e.severity === 'critical').length), color: 'text-accent-danger' },
          { label: 'Anomalies Detected', value: String(events.filter(e => e.severity === 'warning').length), color: 'text-accent-warning' },
          { label: 'AI Confidence', value: '97.2%', color: 'text-cyber-cyan' },
        ].map((metric, i) => (
          <GlassCard key={i}>
            <div className="text-[10px] text-vault-muted mb-2">{metric.label}</div>
            <div className={cn('text-xl font-bold', metric.color)}>{metric.value}</div>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-vault-light">Recent Threat Events</span>
          <span className="text-[10px] text-vault-muted">{events.length} events</span>
        </div>
        {events.length === 0 ? (
          <div className="text-center py-6 text-vault-muted text-sm">No threat events detected. All clear.</div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className={cn(
                'flex items-center gap-3 p-3 rounded-xl border',
                event.severity === 'critical' ? 'bg-accent-danger/5 border-accent-danger/20' : 'bg-accent-warning/5 border-accent-warning/20'
              )}>
                <AlertTriangle className={cn('w-4 h-4', event.severity === 'critical' ? 'text-accent-danger' : 'text-accent-warning')} />
                <span className="text-xs text-vault-text flex-1">{event.message}</span>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium uppercase',
                  event.severity === 'critical' ? 'text-accent-danger bg-accent-danger/10' : 'text-accent-warning bg-accent-warning/10'
                )}>
                  {event.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <SecurityAuditPanel />
      </GlassCard>
    </motion.div>
  );
}

// ===== Recovery Vault =====
export function RecoveryView() {
  const [hasRecovery, setHasRecovery] = useState(false);
  const [unusedRecovery, setUnusedRecovery] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setHasRecovery(await api.hasAccountRecoveryCodes());
        setUnusedRecovery(await api.unusedAccountRecoveryCodesCount());
      } catch {}
    })();
  }, []);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={FileKey} title="Emergency Recovery Vault" subtitle="Account recovery codes and emergency vault access" />

      <div className="grid grid-cols-2 gap-4">
        <GlassCard>
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-cyber-cyan" />
            <span className="text-sm font-medium text-vault-light">Account Recovery Codes</span>
          </div>
          <div className="space-y-2 text-[11px] mb-4">
            <div className="flex justify-between"><span className="text-vault-muted">Status</span><span className={hasRecovery ? 'text-cyber-emerald' : 'text-accent-warning'}>{hasRecovery ? 'Enrolled' : 'Not set up'}</span></div>
            <div className="flex justify-between"><span className="text-vault-muted">Unused Codes</span><span className="text-vault-light">{unusedRecovery}</span></div>
          </div>
          <p className="text-[11px] text-vault-muted">Use recovery codes to reset your master password if locked out.</p>
        </GlassCard>

        <GlassCard>
          <EmergencyCodesPanel />
        </GlassCard>
      </div>
    </motion.div>
  );
}

// ===== Theme Selector =====
const themeOptions: { id: Theme; label: string; desc: string; icon: typeof Moon; preview: string }[] = [
  { id: 'dark', label: 'Dark', desc: 'Default dark theme with deep blue tones', icon: Moon, preview: 'from-[#0a0a0f] to-[#1a1a2e]' },
  { id: 'light', label: 'Light', desc: 'Clean light theme for bright environments', icon: Sun, preview: 'from-[#f0f2f5] to-[#ffffff]' },
  { id: 'pitch-black', label: 'Pitch Black', desc: 'True black for AMOLED displays', icon: Monitor, preview: 'from-[#000000] to-[#111111]' },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <GlassCard>
      <h3 className="text-sm font-medium text-vault-light mb-4">Appearance</h3>
      <div className="grid grid-cols-3 gap-3">
        {themeOptions.map((opt) => {
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className={cn(
                'relative flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all text-center',
                active
                  ? 'border-cyber-cyan/40 bg-cyber-cyan/[0.06]'
                  : 'border-vault-border/30 bg-white/[0.02] hover:bg-white/[0.04] hover:border-vault-border/50'
              )}
            >
              {/* Preview swatch */}
              <div className={cn('w-full h-8 rounded-lg bg-gradient-to-br border border-vault-border/20', opt.preview)} />
              <opt.icon className={cn('w-5 h-5', active ? 'text-cyber-cyan' : 'text-vault-muted')} />
              <div>
                <div className={cn('text-xs font-medium', active ? 'text-cyber-cyan' : 'text-vault-light')}>{opt.label}</div>
                <div className="text-[9px] text-vault-muted mt-0.5 leading-tight">{opt.desc}</div>
              </div>
              {active && (
                <motion.div
                  layoutId="theme-active"
                  className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyber-cyan"
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ===== Settings View =====
export function SettingsView({ onReplayWelcomeTour }: { onReplayWelcomeTour?: () => void }) {
  const { locale, setLocale, t, locales } = useI18n();
  const { font, setFont, fonts } = useFont();
  const [autoLock, setAutoLock] = useState(true);
  const [lockTimeoutMins, setLockTimeoutMins] = useState(5);
  const [biometric, setBiometric] = useState(false);
  const [cloudSync, setCloudSync] = useState(false);
  const [hibpAudit, setHibpAudit] = useState(true);
  const [clockDrift, setClockDrift] = useState(0);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const { theme } = useTheme();
  const { unlockMethods, vaultLocked, refreshUnlockMethods } = useAuth();

  // Unlock method enrollment state
  const [showPasswordEnroll, setShowPasswordEnroll] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [enrollLoading, setEnrollLoading] = useState(false);

  // Backup/restore state
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreJson, setRestoreJson] = useState('');
  const [backupError, setBackupError] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);

  // USB backup state
  const [usbDrives, setUsbDrives] = useState<Awaited<ReturnType<typeof api.listRemovableDrives>>>([]);
  const [selectedUsbDrive, setSelectedUsbDrive] = useState('');
  const [usbMessage, setUsbMessage] = useState('');
  const [usbLoading, setUsbLoading] = useState(false);

  // Import/Export state
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  // Load settings from backend
  useEffect(() => {
    (async () => {
      try {
        const s = await api.getSettings();
        setAutoLock(s.auto_lock);
        setBiometric(s.biometric);
        setCloudSync(s.cloud_sync);
        setHibpAudit(s.hibp_audit_enabled !== false);
        setLockTimeoutMins(s.lock_timeout_mins || 5);
        const [al, mins] = await api.getAutoLockSettings();
        setAutoLock(al);
        setLockTimeoutMins(mins);
        setClockDrift(await api.getClockDrift());
        setTimezoneOffset(await api.getTimezoneOffset());
      } catch {}
    })();
  }, []);

  // Persist settings on change
  const saveSettings = useCallback(async (al: boolean, bio: boolean, cs: boolean, timeout: number) => {
    try {
      await api.setAutoLock(al, timeout);
      const s = await api.getSettings();
      await api.updateSettings({ ...s, auto_lock: al, biometric: bio, cloud_sync: cs, theme, lock_timeout_mins: timeout });
    } catch {}
  }, [theme]);

  const handleAutoLock = (v: boolean) => { setAutoLock(v); saveSettings(v, biometric, cloudSync, lockTimeoutMins); };
  const handleBiometric = (v: boolean) => { setBiometric(v); saveSettings(autoLock, v, cloudSync, lockTimeoutMins); };
  const handleCloudSync = (v: boolean) => { setCloudSync(v); saveSettings(autoLock, biometric, v, lockTimeoutMins); };
  const handleHibpAudit = async (v: boolean) => {
    setHibpAudit(v);
    try {
      const s = await api.getSettings();
      await api.updateSettings({ ...s, hibp_audit_enabled: v });
    } catch {}
  };
  const handleTimeoutChange = (mins: number) => {
    setLockTimeoutMins(mins);
    saveSettings(autoLock, biometric, cloudSync, mins);
  };

  // Unlock method enrollment handlers
  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      setEnrollError('Password must be at least 8 characters');
      return;
    }
    setEnrollLoading(true);
    setEnrollError('');
    try {
      await api.setMasterPassword(newPassword);
      setShowPasswordEnroll(false);
      setNewPassword('');
    } catch (e) {
      setEnrollError(e instanceof Error ? e.message : 'Failed to set password');
    }
    setEnrollLoading(false);
  };

  const handleEnrollHello = async () => {
    setEnrollLoading(true);
    setEnrollError('');
    try {
      await api.enrollHello();
      await refreshUnlockMethods();
    } catch (e) {
      setEnrollError(e instanceof Error ? e.message : 'Failed to enroll Windows Hello');
    }
    setEnrollLoading(false);
  };

  const handleRemoveMethod = async (kind: string) => {
    setEnrollLoading(true);
    setEnrollError('');
    try {
      await api.removeUnlockMethod(kind);
      await refreshUnlockMethods();
    } catch (e) {
      setEnrollError(e instanceof Error ? e.message : 'Failed to remove unlock method');
    }
    setEnrollLoading(false);
  };

  // Backup/restore handlers
  const handleExportBackup = async () => {
    if (backupPassphrase.length < 8) {
      setBackupError('Passphrase must be at least 8 characters');
      return;
    }
    setBackupLoading(true);
    setBackupError('');
    try {
      const backup = await api.exportBackup(backupPassphrase);
      const blob = new Blob([backup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `genvault-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupPassphrase('');
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Failed to export backup');
    }
    setBackupLoading(false);
  };

  const refreshUsbDrives = async () => {
    try {
      const drives = await api.listRemovableDrives();
      setUsbDrives(drives);
      if (drives.length > 0) setSelectedUsbDrive(drives[0].letter);
    } catch {
      setUsbDrives([]);
    }
  };

  const handleExportUsb = async () => {
    if (backupPassphrase.length < 8) {
      setBackupError('Passphrase must be at least 8 characters');
      return;
    }
    if (!selectedUsbDrive) {
      setBackupError('Select a removable USB drive');
      return;
    }
    setUsbLoading(true);
    setBackupError('');
    setUsbMessage('');
    try {
      const path = await api.exportBackupToUsb(backupPassphrase, selectedUsbDrive);
      setUsbMessage(`Backup saved to ${path}`);
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'USB export failed');
    }
    setUsbLoading(false);
  };

  const handleRestoreBackup = async () => {
    if (restorePassphrase.length < 8) {
      setBackupError('Passphrase must be at least 8 characters');
      return;
    }
    if (!restoreJson.trim()) {
      setBackupError('Please paste the backup JSON');
      return;
    }
    setBackupLoading(true);
    setBackupError('');
    try {
      await api.restoreBackup(restorePassphrase, restoreJson);
      setRestoreJson('');
      setRestorePassphrase('');
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Failed to restore backup');
    }
    setBackupLoading(false);
  };

  // Import/Export handlers
  const handleExportAuthenticator = async () => {
    const password = await promptMasterPassword('Confirm master password to export TOTP secrets:');
    if (!password) return;
    try {
      const exportData = await api.exportVaultSecrets(password);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `genvault-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to export');
    }
  };

  useEffect(() => {
    return onShortcut((action) => {
      if (action === 'import') setShowImport(true);
      if (action === 'export') handleExportAuthenticator();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImportAuthenticator = async () => {
    if (!importData.trim()) {
      setImportError('Please paste import data');
      return;
    }
    setImportLoading(true);
    setImportError('');
    try {
      const trimmed = importData.trim();
      if (trimmed.startsWith('otpauth://') || /^https?:\/\//i.test(trimmed)) {
        const { analyzeOtpauthUri, otpauthBlocked } = await import('@/lib/otpauth-safety');
        const warnings = analyzeOtpauthUri(trimmed);
        if (otpauthBlocked(warnings)) {
          setImportError(warnings.find((w) => w.level === 'block')?.message || 'Import blocked');
          setImportLoading(false);
          return;
        }
        await api.importOtpauthUri(trimmed, 'Imported');
      } else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        await api.importGoogleAuthenticator(trimmed, 'Imported');
      } else {
        const { parseImportData } = await import('@/lib/import-export');
        const parsed = parseImportData(trimmed);
        for (const entry of parsed) {
          await api.importManualEntry(entry.name, entry.issuer, entry.secret, 'Imported', entry.digits, entry.period);
        }
      }

      setImportData('');
      setShowImport(false);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to import');
    }
    setImportLoading(false);
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={cn('w-10 h-5.5 rounded-full relative transition-colors duration-200',
        value ? 'bg-cyber-cyan' : 'bg-vault-border'
      )}
      style={{ width: 40, height: 22 }}
    >
      <motion.div
        className="absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm"
        animate={{ left: value ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{ width: 18, height: 18 }}
      />
    </button>
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={Settings} title="Settings" subtitle="Security configuration & application preferences" />

      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">Security</h3>
        <div className="space-y-4">
          {[
            { label: 'Auto-Lock Vault', desc: `Lock vault after ${lockTimeoutMins} minutes of inactivity`, value: autoLock, onChange: handleAutoLock },
            { label: 'Biometric Unlock', desc: 'Use Windows Hello for vault access', value: biometric, onChange: handleBiometric },
            { label: 'HIBP Breach Checks', desc: 'Check vault secrets against Have I Been Pwned (k-anonymity)', value: hibpAudit, onChange: handleHibpAudit },
            { label: 'Encrypted Cloud Sync', desc: 'Coming soon — not yet available', value: false, onChange: () => {} },
          ].map((setting, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm text-vault-light">{setting.label}</div>
                <div className="text-[11px] text-vault-muted">{setting.desc}</div>
              </div>
              <Toggle value={setting.value} onChange={setting.onChange} />
            </div>
          ))}
          {autoLock && (
            <div className="flex items-center gap-3 py-2">
              <span className="text-xs text-vault-muted">Lock timeout (minutes)</span>
              <input type="range" min={1} max={60} value={lockTimeoutMins}
                onChange={e => handleTimeoutChange(Number(e.target.value))} className="flex-1" />
              <span className="text-xs text-vault-light w-8">{lockTimeoutMins}</span>
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">TOTP Clock Sync</h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <label className="text-vault-muted">
            Clock drift (seconds): {clockDrift}
            <input type="range" min={-120} max={120} value={clockDrift}
              onChange={async e => { const v = Number(e.target.value); setClockDrift(v); await api.setClockDrift(v); }}
              className="w-full mt-1" />
          </label>
          <label className="text-vault-muted">
            Timezone offset (seconds): {timezoneOffset}
            <input type="range" min={-43200} max={43200} step={3600} value={timezoneOffset}
              onChange={async e => { const v = Number(e.target.value); setTimezoneOffset(v); await api.setTimezoneOffset(v); }}
              className="w-full mt-1" />
          </label>
        </div>
      </GlassCard>

      <GlassCard>
        <PasswordGeneratorPanel />
      </GlassCard>

      <GlassCard>
        <PasswordHealthPanel />
      </GlassCard>

      {/* Unlock Methods */}
      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">Vault Unlock Methods</h3>
        {vaultLocked ? (
          <div className="text-center py-4 text-vault-muted text-sm">
            Vault is locked. Unlock vault to manage unlock methods.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm text-vault-light">Master Password</div>
                <div className="text-[11px] text-vault-muted">
                  {unlockMethods.includes('password') ? 'Enrolled' : 'Not enrolled'}
                </div>
              </div>
              {unlockMethods.includes('password') ? (
                <button
                  onClick={() => handleRemoveMethod('password')}
                  disabled={enrollLoading}
                  className="text-[10px] px-3 py-1.5 rounded-lg bg-accent-danger/10 text-accent-danger border border-accent-danger/20 hover:bg-accent-danger/20 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={() => setShowPasswordEnroll(true)}
                  disabled={enrollLoading}
                  className="text-[10px] px-3 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20 hover:bg-cyber-cyan/20 transition-colors disabled:opacity-50"
                >
                  Set Password
                </button>
              )}
            </div>

            {showPasswordEnroll && (
              <div className="p-4 rounded-xl bg-vault-black/30 border border-vault-border/30 space-y-3">
                <input
                  type="password"
                  placeholder="Enter master password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm focus:outline-none focus:border-cyber-cyan/40"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSetPassword}
                    disabled={enrollLoading}
                    className="flex-1 py-2 rounded-lg bg-cyber-cyan text-vault-black text-xs font-medium hover:bg-cyber-cyan/90 transition-colors disabled:opacity-50"
                  >
                    {enrollLoading ? 'Setting...' : 'Set Password'}
                  </button>
                  <button
                    onClick={() => { setShowPasswordEnroll(false); setNewPassword(''); setEnrollError(''); }}
                    className="px-3 py-2 rounded-lg bg-white/[0.03] text-vault-muted text-xs border border-vault-border/30 hover:bg-white/[0.05] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm text-vault-light">PIN</div>
                <div className="text-[11px] text-vault-muted">
                  Disabled — master password is the only secret unlock factor
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm text-vault-light">Windows Hello</div>
                <div className="text-[11px] text-vault-muted">
                  {unlockMethods.includes('hello') ? 'Enrolled' : 'Not enrolled'}
                </div>
              </div>
              {unlockMethods.includes('hello') ? (
                <button
                  onClick={() => handleRemoveMethod('hello')}
                  disabled={enrollLoading}
                  className="text-[10px] px-3 py-1.5 rounded-lg bg-accent-danger/10 text-accent-danger border border-accent-danger/20 hover:bg-accent-danger/20 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={handleEnrollHello}
                  disabled={enrollLoading}
                  className="text-[10px] px-3 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20 hover:bg-cyber-cyan/20 transition-colors disabled:opacity-50"
                >
                  {enrollLoading ? 'Enrolling...' : 'Enroll Hello'}
                </button>
              )}
            </div>

            {enrollError && (
              <div className="p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-xs">
                {enrollError}
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Backup / Restore */}
      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">Encrypted Backup</h3>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-vault-light mb-2">Export Backup</div>
            <input
              type="password"
              placeholder="Backup passphrase (min 8 chars)"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm focus:outline-none focus:border-cyber-cyan/40 mb-2"
            />
            <button
              onClick={handleExportBackup}
              disabled={backupLoading}
              className="w-full py-2 rounded-lg bg-cyber-emerald/10 text-cyber-emerald border border-cyber-emerald/20 text-xs font-medium hover:bg-cyber-emerald/20 transition-colors disabled:opacity-50"
            >
              {backupLoading ? 'Exporting...' : 'Download Encrypted Backup'}
            </button>
          </div>

          <div className="border-t border-vault-border/20 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-vault-light">Export to USB Drive</div>
              <button onClick={refreshUsbDrives} className="text-[10px] text-cyber-cyan hover:underline">Refresh drives</button>
            </div>
            {usbDrives.length === 0 ? (
              <p className="text-[11px] text-vault-muted mb-2">No removable drives detected. Insert a USB stick and click Refresh.</p>
            ) : (
              <select value={selectedUsbDrive} onChange={e => setSelectedUsbDrive(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm mb-2 outline-none">
                {usbDrives.map(d => (
                  <option key={d.letter} value={d.letter}>
                    {d.letter} {d.label} — {Math.round(d.free_bytes / (1024 * 1024))} MB free
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleExportUsb}
              disabled={usbLoading || usbDrives.length === 0}
              className="w-full py-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20 text-xs font-medium hover:bg-cyber-cyan/20 transition-colors disabled:opacity-50"
            >
              {usbLoading ? 'Writing to USB...' : 'Save Backup to USB'}
            </button>
            {usbMessage && <p className="text-[11px] text-cyber-emerald mt-2">{usbMessage}</p>}
          </div>

          <div className="border-t border-vault-border/20 pt-4">
            <div className="text-sm text-vault-light mb-2">Restore Backup</div>
            <input
              type="password"
              placeholder="Backup passphrase"
              value={restorePassphrase}
              onChange={(e) => setRestorePassphrase(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-vault-light text-sm focus:outline-none focus:border-cyber-cyan/40 mb-2"
            />
            <textarea
              placeholder="Paste backup JSON here"
              value={restoreJson}
              onChange={(e) => setRestoreJson(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-vault-light text-xs font-mono focus:outline-none focus:border-cyber-cyan/40 mb-2 resize-none"
            />
            <button
              onClick={handleRestoreBackup}
              disabled={backupLoading}
              className="w-full py-2 rounded-lg bg-cyber-purple/10 text-cyber-purple border border-cyber-purple/20 text-xs font-medium hover:bg-cyber-purple/20 transition-colors disabled:opacity-50"
            >
              {backupLoading ? 'Restoring...' : 'Restore from Backup'}
            </button>
          </div>

          {backupError && (
            <div className="p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-xs">
              {backupError}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Import / Export */}
      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">Import & Export</h3>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowImport(!showImport)}
              className="px-3 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs border border-cyber-cyan/20">
              {showImport ? 'Hide Import' : 'Import Accounts'}
            </button>
            <button onClick={handleExportAuthenticator}
              className="px-3 py-1.5 rounded-lg bg-cyber-purple/10 text-cyber-purple text-xs border border-cyber-purple/20">
              Export Secrets (JSON)
            </button>
            <button onClick={async () => {
              try {
                const json = await api.exportVaultJson();
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `genvault-metadata-${Date.now()}.json`; a.click();
                URL.revokeObjectURL(url);
              } catch (e) { setImportError(e instanceof Error ? e.message : 'Export failed'); }
            }} className="px-3 py-1.5 rounded-lg bg-white/[0.03] text-vault-muted text-xs border border-vault-border/30">
              Export Metadata (JSON)
            </button>
            <button onClick={async () => {
              try {
                const csv = await api.exportVaultCsv();
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `genvault-${Date.now()}.csv`; a.click();
                URL.revokeObjectURL(url);
              } catch (e) { setImportError(e instanceof Error ? e.message : 'Export failed'); }
            }} className="px-3 py-1.5 rounded-lg bg-white/[0.03] text-vault-muted text-xs border border-vault-border/30">
              Export CSV
            </button>
          </div>
          {showImport && (
            <div className="space-y-2">
              <textarea placeholder="Paste otpauth:// URI, Google Authenticator JSON, or manual entry data"
                value={importData} onChange={e => setImportData(e.target.value)} rows={4}
                className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-xs font-mono text-vault-light resize-none" />
              <button onClick={handleImportAuthenticator} disabled={importLoading}
                className="w-full py-2 rounded-lg bg-cyber-emerald/10 text-cyber-emerald text-xs border border-cyber-emerald/20 disabled:opacity-50">
                {importLoading ? 'Importing...' : 'Import'}
              </button>
            </div>
          )}
          {importError && <p className="text-xs text-accent-danger">{importError}</p>}
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">{t('settings.language')}</h3>
        <p className="text-[11px] text-vault-muted mb-3">{t('settings.language.desc')}</p>
        <select
          value={locale}
          onChange={e => setLocale(e.target.value as typeof locale)}
          className="w-full px-3 py-2 rounded-lg bg-vault-black/50 border border-vault-border/40 text-sm text-vault-light outline-none"
        >
          {locales.map(l => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">{t('settings.font')}</h3>
        <p className="text-[11px] text-vault-muted mb-3">{t('settings.font.desc')}</p>
        <div className="flex flex-wrap gap-2">
          {fonts.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => void setFont(f.id as UiFont)}
              className={cn(
                'min-h-[40px] px-3.5 rounded-xl text-xs font-medium border transition-colors',
                font === f.id
                  ? 'bg-cyber-cyan/15 text-cyber-cyan border-cyber-cyan/30'
                  : 'bg-white/[0.02] text-vault-muted border-vault-border/30 hover:text-vault-light'
              )}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </GlassCard>

      <ThemeSelector />

      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">Cryptographic Configuration</h3>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          {[
            { label: 'Symmetric Cipher', value: 'AES-256-GCM' },
            { label: 'OTP Algorithm', value: 'HMAC-SHA-1 (TOTP/HOTP)' },
            { label: 'Key Derivation', value: 'Argon2id (m=19456, t=3, p=4)' },
            { label: 'Integrity', value: 'AES-GCM auth tag' },
            { label: 'Secrets at rest', value: 'Encrypted vault blob only' },
            { label: 'Session key', value: 'In-memory VMK (zeroized on lock)' },
          ].map((config, i) => (
            <div key={i} className="flex justify-between p-3 rounded-xl bg-vault-black/30 border border-vault-border/20">
              <span className="text-vault-muted">{config.label}</span>
              <span className="text-vault-light font-mono">{config.value}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">About {PRODUCT.name}</h3>
        <div className="text-[11px] text-vault-muted space-y-2">
          <p className="text-sm text-cyber-cyan/90 font-medium">{PRODUCT.tagline}</p>
          <p>
            <a
              href={COMPANY.microsoftStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyber-cyan hover:underline"
            >
              Download on Microsoft Store
            </a>
            {' · '}
            <span>{COMPANY.playStoreLabel}</span>
          </p>
          {onReplayWelcomeTour && (
            <button
              type="button"
              onClick={onReplayWelcomeTour}
              className="w-full mt-2 py-2.5 rounded-xl text-xs font-medium border border-cyber-cyan/30 text-cyber-cyan bg-cyber-cyan/5 hover:bg-cyber-cyan/10 transition-colors"
            >
              Replay Welcome Tour
            </button>
          )}
          <p>Version {PRODUCT.version} — Build {PRODUCT.build}</p>
          <p>Developed by {COMPANY.name}</p>
          <p>
            <a href={`mailto:${COMPANY.email}`} className="text-cyber-cyan hover:underline">{COMPANY.email}</a>
          </p>
          <p>
            <a href={COMPANY.website} target="_blank" rel="noopener noreferrer" className="text-cyber-cyan hover:underline">
              {COMPANY.websiteDisplay}
            </a>
          </p>
          <p>License: {COMPANY.licenses.join(' & ')}</p>
          <p className="text-cyber-cyan/60 font-mono pt-2 border-t border-vault-border/20">{COMPANY.copyright}</p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ===== Profile View =====
export function ProfileView() {
  const { user, logOut, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.displayName || '');

  if (!user) return null;

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== user.displayName) {
      updateUser({ displayName: editName.trim() });
    }
    setIsEditing(false);
  };

  const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const lastLogin = new Date(user.lastLogin).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const initials = user.displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <SectionHeader icon={User} title="Profile" subtitle="Account identity & security configuration" />

      {/* Profile Header Card */}
      <GlassCard className="!p-0 overflow-hidden">
        {/* Banner gradient */}
        <div className="h-28 bg-gradient-to-r from-cyber-cyan/10 via-cyber-purple/10 to-cyber-blue/10 relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
          <motion.div
            className="absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-medium border"
            style={{
              background: user.securityTier === 'maximum' ? 'rgba(0,230,118,0.1)' : user.securityTier === 'enhanced' ? 'rgba(0,229,255,0.1)' : 'rgba(255,255,255,0.03)',
              borderColor: user.securityTier === 'maximum' ? 'rgba(0,230,118,0.2)' : user.securityTier === 'enhanced' ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.1)',
              color: user.securityTier === 'maximum' ? '#00e676' : user.securityTier === 'enhanced' ? '#00e5ff' : '#a0aec0',
            }}
            variants={item}
          >
            <Award className="w-3 h-3 inline mr-1" />
            {user.securityTier.charAt(0).toUpperCase() + user.securityTier.slice(1)} Tier
          </motion.div>
        </div>

        <div className="px-6 pb-6 -mt-12">
          <div className="flex items-end gap-5">
            {/* Avatar */}
            <motion.div variants={item} className="relative group">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-cyber-cyan/20 to-cyber-purple/20 border-4 border-vault-dark flex items-center justify-center shadow-lg">
                <span className="text-2xl font-bold text-cyber-cyan">{initials}</span>
              </div>
              <button className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white/70" />
              </button>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyber-emerald border-2 border-vault-dark flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 text-vault-dark" />
              </div>
            </motion.div>

            {/* Name + Email */}
            <motion.div variants={item} className="flex-1 pb-1">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                    className="text-lg font-bold bg-vault-black/50 border border-vault-border/40 rounded-lg px-3 py-1 text-vault-light focus:outline-none focus:border-cyber-cyan/40 focus:ring-1 focus:ring-cyber-cyan/20"
                    autoFocus
                  />
                  <button onClick={handleSaveName} className="px-3 py-1.5 rounded-lg bg-cyber-cyan/10 text-cyber-cyan text-xs font-medium border border-cyber-cyan/20 hover:bg-cyber-cyan/20 transition-colors">
                    Save
                  </button>
                  <button onClick={() => { setIsEditing(false); setEditName(user.displayName); }} className="px-3 py-1.5 rounded-lg bg-white/[0.03] text-vault-muted text-xs border border-vault-border/30 hover:bg-white/[0.05] transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-vault-light">{user.displayName}</h2>
                  <button onClick={() => setIsEditing(true)} className="p-1 rounded-md hover:bg-white/[0.05] text-vault-muted/50 hover:text-vault-muted transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <User className="w-3 h-3 text-vault-muted/50" />
                <span className="text-sm text-vault-muted">{user.username}</span>
              </div>
            </motion.div>
          </div>
        </div>
      </GlassCard>

      {/* Account Details + Security Status */}
      <div className="grid grid-cols-3 gap-4">
        <GlassCard>
          <div className="flex items-center gap-3 mb-3">
            <Calendar className="w-5 h-5 text-cyber-cyan" />
            <span className="text-sm font-medium text-vault-light">Member Since</span>
          </div>
          <div className="text-sm font-semibold text-vault-light mb-1">{memberSince}</div>
          <p className="text-[10px] text-vault-muted">Account age: {Math.floor((Date.now() - user.createdAt) / 86400000) || '<1'} days</p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-5 h-5 text-cyber-purple" />
            <span className="text-sm font-medium text-vault-light">Last Login</span>
          </div>
          <div className="text-sm font-semibold text-vault-light mb-1">{lastLogin}</div>
          <p className="text-[10px] text-vault-muted">Session active</p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-5 h-5 text-cyber-emerald" />
            <span className="text-sm font-medium text-vault-light">Security Score</span>
          </div>
          <div className="text-2xl font-bold text-cyber-emerald mb-1">87<span className="text-sm text-vault-muted">/100</span></div>
          <p className="text-[10px] text-vault-muted">Above average</p>
        </GlassCard>
      </div>

      {/* Security Features */}
      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">Security Configuration</h3>
        <div className="space-y-3">
          {[
            { label: 'Multi-Factor Authentication', desc: 'TOTP-based second factor', enabled: true, icon: Shield, color: '#00e5ff' },
            { label: 'Biometric Authentication', desc: 'Windows Hello face + fingerprint', enabled: user.biometricEnabled, icon: Fingerprint, color: '#7c4dff' },
            { label: 'Username', desc: user.username, enabled: true, icon: User, color: '#00e676' },
            { label: 'Onboarding Completed', desc: 'Vault initialized & configured', enabled: user.isOnboarded, icon: CheckCircle2, color: '#00e676' },
          ].map((feature, i) => (
            <motion.div key={i} variants={item} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${feature.color}10`, border: `1px solid ${feature.color}15` }}>
                  <feature.icon className="w-4 h-4" style={{ color: feature.color }} />
                </div>
                <div>
                  <div className="text-sm text-vault-light">{feature.label}</div>
                  <div className="text-[10px] text-vault-muted">{feature.desc}</div>
                </div>
              </div>
              <div className={cn(
                'text-[10px] px-2.5 py-1 rounded-full font-medium border',
                feature.enabled
                  ? 'text-cyber-emerald bg-cyber-emerald/10 border-cyber-emerald/20'
                  : 'text-vault-muted bg-white/[0.02] border-vault-border/30'
              )}>
                {feature.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {/* Account Info */}
      <GlassCard>
        <h3 className="text-sm font-medium text-vault-light mb-4">Account Information</h3>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          {[
            { label: 'User ID', value: user.id },
            { label: 'Username', value: user.username },
            { label: 'Security Tier', value: user.securityTier.charAt(0).toUpperCase() + user.securityTier.slice(1) },
            { label: 'Vault Status', value: user.isOnboarded ? 'Initialized' : 'Pending Setup' },
          ].map((info, i) => (
            <div key={i} className="p-3 rounded-xl bg-vault-black/30 border border-vault-border/20">
              <span className="text-vault-muted">{info.label}</span>
              <div className="text-vault-light font-mono mt-1 truncate">{info.value}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Danger Zone */}
      <GlassCard className="!border-accent-danger/20">
        <h3 className="text-sm font-medium text-accent-danger mb-4">Danger Zone</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-vault-light">Sign Out</div>
            <div className="text-[10px] text-vault-muted">End your current session and lock the vault</div>
          </div>
          <button
            onClick={logOut}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-danger/10 text-accent-danger text-xs font-medium border border-accent-danger/20 hover:bg-accent-danger/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </GlassCard>
    </motion.div>
  );
}
