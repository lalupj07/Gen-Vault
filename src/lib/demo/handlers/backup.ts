import { hashPassword, verifyPassword } from '../crypto';
import type { DemoHandler, DemoHistoryRow, DemoState, DemoVaultEntry } from '../types';
import {
  createDemoEntry,
  findEntry,
  newEntryId,
  nowTs,
  requireUnlocked,
  toPublicEntry,
  verifyMasterPassword,
} from './vault';

interface BackupPayload {
  version: 1;
  passphraseHash: string;
  entries: DemoVaultEntry[];
  settings: DemoState['settings'];
  attachments: DemoState['attachments'];
}

interface TransferPayload {
  version: 1;
  passphraseHash: string;
  entries: DemoVaultEntry[];
}

interface SharePayload {
  version: 1;
  passphraseHash: string;
  entry_ids: string[];
  entries: DemoVaultEntry[];
  expires_at: number | null;
}

async function verifyPassphrase(passphrase: string, payload: { passphraseHash: string }): Promise<void> {
  if (!(await verifyPassword(passphrase, payload.passphraseHash))) {
    throw new Error('Invalid passphrase');
  }
}

function appendHistory(
  state: DemoState,
  entryId: string,
  entryName: string,
  action: string,
  field: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null,
): void {
  const row: DemoHistoryRow = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entry_id: entryId,
    entry_name: entryName,
    action,
    field,
    old_value: oldValue,
    new_value: newValue,
    timestamp: nowTs(),
  };
  state.history.unshift(row);
  if (state.history.length > 500) state.history.length = 500;
}

export const backupHandlers: Record<string, DemoHandler> = {
  export_backup: async (state, args) => {
    requireUnlocked(state);
    const passphrase = String(args?.passphrase ?? '');
    if (!passphrase) throw new Error('Passphrase is required');
    const payload: BackupPayload = {
      version: 1,
      passphraseHash: await hashPassword(passphrase),
      entries: structuredClone(state.entries),
      settings: structuredClone(state.settings),
      attachments: structuredClone(state.attachments),
    };
    return JSON.stringify(payload);
  },

  restore_backup: async (state, args) => {
    const passphrase = String(args?.passphrase ?? '');
    const backupJson = String(args?.backupJson ?? '');
    if (!passphrase) throw new Error('Passphrase is required');
    const payload = JSON.parse(backupJson) as BackupPayload;
    if (payload.version !== 1) throw new Error('Unsupported backup version');
    await verifyPassphrase(passphrase, payload);
    state.entries = payload.entries;
    state.settings = payload.settings;
    state.attachments = payload.attachments ?? {};
  },

  export_vault: (state) => {
    requireUnlocked(state);
    return JSON.stringify(state.entries.map((e) => toPublicEntry(state, e)));
  },

  export_vault_json: (state) => {
    requireUnlocked(state);
    return JSON.stringify(state.entries.map((e) => toPublicEntry(state, e)));
  },

  export_vault_secrets_json: async (state, args) => {
    requireUnlocked(state);
    await verifyMasterPassword(state, String(args?.password ?? ''));
    return JSON.stringify(
      state.entries.map(({ secret, notes_plain, notes, ...rest }) => ({
        ...rest,
        secret,
        notes: notes_plain ?? notes ?? '',
      })),
    );
  },

  export_vault_csv: (state) => {
    requireUnlocked(state);
    const header = 'id,name,issuer,category,favorite,tags';
    const rows = state.entries.map((e) =>
      [e.id, e.name, e.issuer, e.category, e.favorite ? '1' : '0', (e.tags ?? []).join('|')]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header, ...rows].join('\n');
  },

  create_vault_transfer: async (state, args) => {
    requireUnlocked(state);
    const passphrase = String(args?.passphrase ?? '');
    if (!passphrase) throw new Error('Passphrase is required');
    const payload: TransferPayload = {
      version: 1,
      passphraseHash: await hashPassword(passphrase),
      entries: structuredClone(state.entries),
    };
    return JSON.stringify(payload);
  },

  import_vault_transfer: async (state, args) => {
    requireUnlocked(state);
    const passphrase = String(args?.passphrase ?? '');
    const payloadStr = String(args?.payload ?? '');
    const payload = JSON.parse(payloadStr) as TransferPayload;
    await verifyPassphrase(passphrase, payload);
    let imported = 0;
    for (const entry of payload.entries) {
      if (!state.entries.some((e) => e.id === entry.id)) {
        state.entries.push(entry);
        imported += 1;
      }
    }
    return imported;
  },

  get_entry_history: (state, args) => {
    requireUnlocked(state);
    const entryId = args?.entryId as string | null | undefined;
    const limit = Math.min(500, Math.max(1, Number(args?.limit ?? 50)));
    let rows = state.history;
    if (entryId) rows = rows.filter((r) => r.entry_id === entryId);
    return rows.slice(0, limit);
  },

  create_vault_share: async (state, args) => {
    requireUnlocked(state);
    const entryIds = (args?.entryIds as string[]) ?? [];
    const passphrase = String(args?.passphrase ?? '');
    const expiresHours = args?.expiresHours as number | null | undefined;
    if (!passphrase) throw new Error('Passphrase is required');
    if (entryIds.length === 0) throw new Error('No entries selected');
    const entries = entryIds.map((id) => structuredClone(findEntry(state, id)));
    const expiresAt = expiresHours ? nowTs() + expiresHours * 3600 : null;
    const payload: SharePayload = {
      version: 1,
      passphraseHash: await hashPassword(passphrase),
      entry_ids: entryIds,
      entries,
      expires_at: expiresAt,
    };
    const payloadStr = JSON.stringify(payload);
    const shareId = `share-${Date.now()}`;
    state.shares.push({
      id: shareId,
      entry_ids: entryIds,
      entry_names: entries.map((e) => e.name),
      payload: payloadStr,
      created_at: nowTs(),
      expires_at: expiresAt,
      revoked: false,
    });
    return {
      share_id: shareId,
      payload: payloadStr,
      entry_count: entries.length,
      expires_at: expiresAt,
    };
  },

  import_vault_share: async (state, args) => {
    requireUnlocked(state);
    const passphrase = String(args?.passphrase ?? '');
    const payloadStr = String(args?.payload ?? '');
    const payload = JSON.parse(payloadStr) as SharePayload;
    await verifyPassphrase(passphrase, payload);
    if (payload.expires_at && payload.expires_at < nowTs()) {
      throw new Error('Share has expired');
    }
    let imported = 0;
    for (const entry of payload.entries) {
      const clone = createDemoEntry({ ...entry, id: newEntryId() });
      state.entries.push(clone);
      appendHistory(state, clone.id, clone.name, 'imported_share');
      imported += 1;
    }
    return imported;
  },

  get_vault_shares: (state) => {
    requireUnlocked(state);
    const now = nowTs();
    return state.shares.map((s) => ({
      id: s.id,
      entry_names: s.entry_names,
      created_at: s.created_at,
      expires_at: s.expires_at,
      revoked: s.revoked,
      expired: s.expires_at !== null && s.expires_at < now,
    }));
  },

  revoke_vault_share: (state, args) => {
    requireUnlocked(state);
    const shareId = String(args?.shareId ?? '');
    const share = state.shares.find((s) => s.id === shareId);
    if (!share) throw new Error('Share not found');
    share.revoked = true;
  },
};
