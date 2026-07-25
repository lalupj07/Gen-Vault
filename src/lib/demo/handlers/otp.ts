import {
  generateTotpCode,
  generateTotpSecret,
  generateProvisioningUri,
  verifyTotpCode,
} from '@/lib/totp-browser';
import type { DemoHandler } from '../types';
import {
  createDemoEntry,
  findEntry,
  newEntryId,
  nowTs,
  requireUnlocked,
  toPublicEntry,
  verifyMasterPassword,
} from './vault';

function effectiveDigits(entry: { digits: number; custom_digits?: number }): number {
  return entry.custom_digits ?? entry.digits;
}

function effectivePeriod(entry: { period: number; custom_period?: number }): number {
  return entry.custom_period ?? entry.period;
}

function normalizeBase32Secret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
}

function parseOtpauthUri(uri: string): {
  label: string;
  secret: string;
  issuer?: string;
  digits: number;
  period: number;
} {
  let parsed: URL;
  try {
    parsed = new URL(uri.trim());
  } catch {
    throw new Error('Invalid otpauth URI');
  }
  if (parsed.protocol !== 'otpauth:') throw new Error('Invalid otpauth URI');
  const secret = parsed.searchParams.get('secret');
  if (!secret) throw new Error('Missing secret in otpauth URI');
  const label = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const issuerParam = parsed.searchParams.get('issuer') ?? undefined;
  const digits = Number(parsed.searchParams.get('digits') ?? 6);
  const period = Number(parsed.searchParams.get('period') ?? 30);
  return {
    label,
    secret: normalizeBase32Secret(secret),
    issuer: issuerParam ?? undefined,
    digits: Number.isFinite(digits) ? digits : 6,
    period: Number.isFinite(period) ? period : 30,
  };
}

function labelToNameIssuer(label: string, issuer?: string): { name: string; issuer: string } {
  const colon = label.indexOf(':');
  if (colon >= 0) {
    return {
      issuer: label.slice(0, colon) || issuer || 'Unknown',
      name: label.slice(colon + 1) || label,
    };
  }
  return { name: label, issuer: issuer ?? 'Unknown' };
}

export const otpHandlers: Record<string, DemoHandler> = {
  generate_otp: async (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    if (entry.is_hotp) {
      throw new Error('HOTP generation is not supported in demo mode');
    }
    const digits = effectiveDigits(entry);
    const period = effectivePeriod(entry);
    const result = await generateTotpCode(entry.secret, digits, period);
    entry.last_used = nowTs();
    state.entryUseCounts[entry.id] = (state.entryUseCounts[entry.id] ?? 0) + 1;
    return result;
  },

  verify_otp: async (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    if (entry.is_hotp) {
      throw new Error('HOTP verification is not supported in demo mode');
    }
    const code = String(args?.code ?? '');
    const digits = effectiveDigits(entry);
    const period = effectivePeriod(entry);
    return verifyTotpCode(entry.secret, code, digits, period);
  },

  generate_totp_secret: () => generateTotpSecret(),

  get_provisioning_uri: async (state, args) => {
    requireUnlocked(state);
    await verifyMasterPassword(state, String(args?.password ?? ''));
    const entry = findEntry(state, String(args?.entryId ?? ''));
    return generateProvisioningUri(
      entry.secret,
      entry.name,
      entry.issuer,
      effectiveDigits(entry),
      effectivePeriod(entry),
    );
  },

  import_otpauth_uri: (state, args) => {
    requireUnlocked(state);
    const parsed = parseOtpauthUri(String(args?.uri ?? ''));
    const { name, issuer } = labelToNameIssuer(parsed.label, parsed.issuer);
    const entry = createDemoEntry({
      id: newEntryId(),
      name,
      issuer,
      secret: parsed.secret,
      category: String(args?.category ?? 'Imported'),
      icon: '🔐',
      color: '#00e5ff',
      digits: parsed.digits,
      period: parsed.period,
    });
    state.entries.push(entry);
    return toPublicEntry(state, entry);
  },

  import_manual_entry: (state, args) => {
    requireUnlocked(state);
    const secret = normalizeBase32Secret(String(args?.secret ?? ''));
    if (!secret) throw new Error('Invalid base32 secret');
    const entry = createDemoEntry({
      id: newEntryId(),
      name: String(args?.name ?? ''),
      issuer: String(args?.issuer ?? ''),
      secret,
      category: String(args?.category ?? 'Imported'),
      icon: '🔐',
      color: '#00e5ff',
      digits: Number(args?.digits ?? 6),
      period: Number(args?.period ?? 30),
    });
    state.entries.push(entry);
    return toPublicEntry(state, entry);
  },

  import_google_authenticator: (state, args) => {
    requireUnlocked(state);
    const json = String(args?.json ?? '');
    const category = String(args?.category ?? 'Imported');
    let parsed: { accounts?: Array<{ name?: string; secret?: string; issuer?: string; digits?: number; period?: number }> };
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Invalid JSON: could not parse Google Authenticator export');
    }
    if (!parsed.accounts || !Array.isArray(parsed.accounts)) {
      throw new Error('Invalid Google Authenticator export: missing accounts array');
    }
    const created = parsed.accounts.map((account) => {
      const name = String(account.name ?? 'Unknown');
      const secret = normalizeBase32Secret(String(account.secret ?? ''));
      if (!secret) throw new Error(`Invalid base32 secret for ${name}`);
      const entry = createDemoEntry({
        id: newEntryId(),
        name,
        issuer: String(account.issuer ?? 'Unknown'),
        secret,
        category,
        icon: '🔐',
        color: '#00e5ff',
        digits: Number(account.digits ?? 6),
        period: Number(account.period ?? 30),
      });
      state.entries.push(entry);
      return toPublicEntry(state, entry);
    });
    return created;
  },

  import_authy_csv: (state, args) => {
    requireUnlocked(state);
    const csv = String(args?.csv ?? '');
    const category = String(args?.category ?? 'Imported');
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error('Invalid Authy CSV: no data rows');
    const created = [];
    for (let i = 1; i < lines.length; i += 1) {
      const parts = lines[i].split(',');
      if (parts.length < 2) continue;
      const name = parts[0].trim();
      const secret = normalizeBase32Secret(parts[1].trim());
      if (!secret) continue;
      const entry = createDemoEntry({
        id: newEntryId(),
        name,
        issuer: 'Authy',
        secret,
        category,
        icon: '🔐',
        color: '#00e5ff',
      });
      state.entries.push(entry);
      created.push(toPublicEntry(state, entry));
    }
    if (created.length === 0) throw new Error('Invalid Authy CSV: no valid entries found');
    return created;
  },

  update_custom_totp_params: (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    entry.custom_period = (args?.customPeriod as number | null | undefined) ?? undefined;
    entry.custom_digits = (args?.customDigits as number | null | undefined) ?? undefined;
  },

  enable_hotp: (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    entry.is_hotp = true;
    entry.hotp_counter = Number(args?.initialCounter ?? 0);
  },

  disable_hotp: (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    entry.is_hotp = false;
    entry.hotp_counter = undefined;
  },

  increment_hotp_counter: (state, args) => {
    requireUnlocked(state);
    const entry = findEntry(state, String(args?.entryId ?? ''));
    if (!entry.is_hotp) throw new Error('Entry is not HOTP');
    entry.hotp_counter = (entry.hotp_counter ?? 0) + 1;
    entry.last_used = nowTs();
    return entry.hotp_counter;
  },
};
