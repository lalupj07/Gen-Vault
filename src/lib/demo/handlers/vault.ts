import type { EntryAttachmentMeta, EntryTemplate, VaultEntry } from '@/lib/api';
import { verifyPassword } from '../crypto';
import type { DemoAttachment, DemoHandler, DemoState, DemoVaultEntry } from '../types';
import { generateTotpSecret } from '@/lib/totp-browser';

const BUILTIN_TEMPLATES: EntryTemplate[] = [
  { id: 'google', name: 'Google', issuer: 'Google', category: 'Email', icon: 'GO', color: '#4285F4', digits: 6, period: 30, tags: ['email', 'google'] },
  { id: 'github', name: 'GitHub', issuer: 'GitHub', category: 'Development', icon: 'GH', color: '#24292E', digits: 6, period: 30, tags: ['development', 'git'] },
  { id: 'aws', name: 'AWS', issuer: 'Amazon Web Services', category: 'Cloud', icon: 'AW', color: '#FF9900', digits: 6, period: 30, tags: ['cloud', 'aws'] },
  { id: 'microsoft', name: 'Microsoft', issuer: 'Microsoft', category: 'Work', icon: 'MS', color: '#00A4EF', digits: 6, period: 30, tags: ['work', 'microsoft'] },
  { id: 'dropbox', name: 'Dropbox', issuer: 'Dropbox', category: 'Storage', icon: 'DB', color: '#0061FF', digits: 6, period: 30, tags: ['storage', 'dropbox'] },
  { id: 'discord', name: 'Discord', issuer: 'Discord', category: 'Social', icon: 'DC', color: '#5865F2', digits: 6, period: 30, tags: ['social', 'gaming'] },
  { id: 'slack', name: 'Slack', issuer: 'Slack', category: 'Communication', icon: 'SL', color: '#4A154B', digits: 6, period: 30, tags: ['work', 'chat'] },
  { id: 'steam', name: 'Steam', issuer: 'Valve', category: 'Gaming', icon: 'ST', color: '#1B2838', digits: 6, period: 30, tags: ['gaming', 'steam'] },
  { id: 'paypal', name: 'PayPal', issuer: 'PayPal', category: 'Finance', icon: 'PP', color: '#003087', digits: 6, period: 30, tags: ['finance', 'payments'] },
  { id: 'cloudflare', name: 'Cloudflare', issuer: 'Cloudflare', category: 'Security', icon: 'CF', color: '#F38020', digits: 6, period: 30, tags: ['security', 'dns'] },
];

export function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

export function newEntryId(): string {
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function requireUnlocked(state: DemoState): void {
  if (!state.unlocked) throw new Error('Vault is locked');
}

export async function verifyMasterPassword(state: DemoState, password: string): Promise<void> {
  if (!state.passwordHash || !(await verifyPassword(password, state.passwordHash))) {
    throw new Error('Incorrect master password');
  }
}

export function attachmentMeta(att: DemoAttachment): EntryAttachmentMeta {
  const { dataBase64: _, ...meta } = att;
  return meta;
}

export function toPublicEntry(state: DemoState, entry: DemoVaultEntry): VaultEntry {
  const notesText = entry.notes_plain ?? entry.notes ?? '';
  const attachments = (state.attachments[entry.id] ?? []).map(attachmentMeta);
  const { secret: _s, notes_plain: _n, ...rest } = entry;
  return {
    ...rest,
    notes: '',
    has_notes: notesText.trim().length > 0,
    attachments,
  };
}

export function findEntry(state: DemoState, entryId: string): DemoVaultEntry {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error('Entry not found');
  return entry;
}

export function createDemoEntry(
  partial: Omit<DemoVaultEntry, 'created_at' | 'last_used'> & Partial<Pick<DemoVaultEntry, 'created_at' | 'last_used'>>,
): DemoVaultEntry {
  const now = nowTs();
  return {
    digits: 6,
    period: 30,
    tags: [],
    favorite: false,
    created_at: now,
    last_used: now,
    ...partial,
  };
}

export const vaultHandlers: Record<string, DemoHandler> = {
  get_vault_entries: (state) => {
    requireUnlocked(state);
    return state.entries.map((e) => toPublicEntry(state, e));
  },

  get_vault_entries_page: (state, args) => {
    requireUnlocked(state);
    const offset = Math.max(0, Number(args?.offset ?? 0));
    const limit = Math.min(500, Math.max(1, Number(args?.limit ?? 50)));
    const all = state.entries.map((e) => toPublicEntry(state, e));
    return {
      entries: all.slice(offset, offset + limit),
      total: all.length,
      offset,
      limit,
    };
  },

  get_vault_entry_count: (state) => {
    requireUnlocked(state);
    return state.entries.length;
  },

  add_vault_entry: (state, args) => {
    requireUnlocked(state);
    const secret = String(args?.secret ?? generateTotpSecret());
    const entry = createDemoEntry({
      id: newEntryId(),
      name: String(args?.name ?? ''),
      issuer: String(args?.issuer ?? ''),
      secret,
      category: String(args?.category ?? 'Other'),
      icon: String(args?.icon ?? '🔐'),
      color: String(args?.color ?? '#00e5ff'),
      digits: Number(args?.digits ?? 6),
      period: Number(args?.period ?? 30),
    });
    state.entries.push(entry);
    return toPublicEntry(state, entry);
  },

  remove_vault_entry: (state, args) => {
    requireUnlocked(state);
    const entryId = String(args?.entryId ?? '');
    const idx = state.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) throw new Error('Entry not found');
    state.entries.splice(idx, 1);
    delete state.attachments[entryId];
  },

  update_vault_entry: (state, args) => {
    requireUnlocked(state);
    const entryId = String(args?.entryId ?? '');
    const entry = findEntry(state, entryId);
    if (args?.name !== undefined) entry.name = String(args.name);
    if (args?.issuer !== undefined) entry.issuer = String(args.issuer);
    if (args?.category !== undefined) entry.category = String(args.category);
    if (args?.notes !== undefined) {
      entry.notes = String(args.notes);
      entry.notes_plain = String(args.notes);
    }
    return toPublicEntry(state, entry);
  },

  reveal_entry_secret: async (state, args) => {
    requireUnlocked(state);
    await verifyMasterPassword(state, String(args?.password ?? ''));
    return findEntry(state, String(args?.entryId ?? '')).secret;
  },

  reveal_entry_notes: async (state, args) => {
    requireUnlocked(state);
    await verifyMasterPassword(state, String(args?.password ?? ''));
    const entry = findEntry(state, String(args?.entryId ?? ''));
    return entry.notes_plain ?? entry.notes ?? '';
  },

  search_vault_entries: (state, args) => {
    requireUnlocked(state);
    const q = String(args?.query ?? '').toLowerCase();
    return state.entries
      .filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.issuer.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      )
      .map((e) => toPublicEntry(state, e));
  },

  filter_vault_entries_by_category: (state, args) => {
    requireUnlocked(state);
    const category = String(args?.category ?? '');
    return state.entries.filter((e) => e.category === category).map((e) => toPublicEntry(state, e));
  },

  filter_vault_entries_by_tags: (state, args) => {
    requireUnlocked(state);
    const tags = (args?.tags as string[]) ?? [];
    return state.entries
      .filter((e) => tags.every((t) => (e.tags ?? []).includes(t)))
      .map((e) => toPublicEntry(state, e));
  },

  get_favorite_entries: (state) => {
    requireUnlocked(state);
    return state.entries.filter((e) => e.favorite).map((e) => toPublicEntry(state, e));
  },

  toggle_entry_favorite: (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    entry.favorite = !entry.favorite;
    return entry.favorite;
  },

  update_entry_tags: (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    entry.tags = (args?.tags as string[]) ?? [];
  },

  bulk_delete_entries: (state, args) => {
    requireUnlocked(state);
    const entryIds = (args?.entryIds as string[]) ?? [];
    const before = state.entries.length;
    state.entries = state.entries.filter((e) => !entryIds.includes(e.id));
    for (const id of entryIds) delete state.attachments[id];
    return before - state.entries.length;
  },

  bulk_update_category: (state, args) => {
    requireUnlocked(state);
    const entryIds = (args?.entryIds as string[]) ?? [];
    const newCategory = String(args?.newCategory ?? '');
    let count = 0;
    for (const entry of state.entries) {
      if (entryIds.includes(entry.id)) {
        entry.category = newCategory;
        count += 1;
      }
    }
    return count;
  },

  bulk_add_tags: (state, args) => {
    requireUnlocked(state);
    const entryIds = (args?.entryIds as string[]) ?? [];
    const tags = (args?.tags as string[]) ?? [];
    let count = 0;
    for (const entry of state.entries) {
      if (entryIds.includes(entry.id)) {
        entry.tags = [...new Set([...(entry.tags ?? []), ...tags])];
        count += 1;
      }
    }
    return count;
  },

  bulk_remove_tags: (state, args) => {
    requireUnlocked(state);
    const entryIds = (args?.entryIds as string[]) ?? [];
    const tags = (args?.tags as string[]) ?? [];
    let count = 0;
    for (const entry of state.entries) {
      if (entryIds.includes(entry.id)) {
        entry.tags = (entry.tags ?? []).filter((t) => !tags.includes(t));
        count += 1;
      }
    }
    return count;
  },

  get_templates: () => BUILTIN_TEMPLATES,

  create_entry_from_template: (state, args) => {
    requireUnlocked(state);
    const templateId = String(args?.templateId ?? '');
    const template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) throw new Error('Template not found');
    const secretArg = args?.secret as string | null | undefined;
    const secret = secretArg?.trim() ? secretArg.trim() : generateTotpSecret();
    const entry = createDemoEntry({
      id: newEntryId(),
      name: template.name,
      issuer: template.issuer,
      secret,
      category: template.category,
      icon: template.icon,
      color: template.color,
      digits: template.digits,
      period: template.period,
      tags: [...template.tags],
      custom_period: template.period,
      custom_digits: template.digits,
    });
    state.entries.push(entry);
    return toPublicEntry(state, entry);
  },

  list_entry_attachments: (state, args) => {
    requireUnlocked(state);
    const entryId = String(args?.entryId ?? '');
    findEntry(state, entryId);
    return (state.attachments[entryId] ?? []).map(attachmentMeta);
  },

  add_entry_attachment: (state, args) => {
    requireUnlocked(state);
    const entryId = String(args?.entryId ?? '');
    findEntry(state, entryId);
    const filename = String(args?.filename ?? 'attachment');
    const mimeType = String(args?.mimeType ?? 'application/octet-stream');
    const dataBase64 = String(args?.dataBase64 ?? '');
    const att: DemoAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filename,
      mime_type: mimeType,
      size: Math.floor((dataBase64.length * 3) / 4),
      created_at: nowTs(),
      dataBase64,
    };
    if (!state.attachments[entryId]) state.attachments[entryId] = [];
    state.attachments[entryId].push(att);
    return attachmentMeta(att);
  },

  remove_entry_attachment: (state, args) => {
    requireUnlocked(state);
    const entryId = String(args?.entryId ?? '');
    const attachmentId = String(args?.attachmentId ?? '');
    findEntry(state, entryId);
    const list = state.attachments[entryId];
    if (!list) throw new Error('Attachment not found');
    const idx = list.findIndex((a) => a.id === attachmentId);
    if (idx === -1) throw new Error('Attachment not found');
    list.splice(idx, 1);
  },

  export_entry_attachment: async (state, args) => {
    requireUnlocked(state);
    await verifyMasterPassword(state, String(args?.password ?? ''));
    const entryId = String(args?.entryId ?? '');
    const attachmentId = String(args?.attachmentId ?? '');
    findEntry(state, entryId);
    const att = (state.attachments[entryId] ?? []).find((a) => a.id === attachmentId);
    if (!att) throw new Error('Attachment not found');
    return att.dataBase64;
  },
};
