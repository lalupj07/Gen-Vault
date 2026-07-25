import type { DeviceEntry, Session } from '@/lib/api';
import { hashPassword, verifyPassword } from '../crypto';
import type { DemoHandler, DemoState } from '../types';
import { nowTs, requireUnlocked, verifyMasterPassword } from './vault';

const PASSPHRASE_WORDS = [
  'apple', 'bridge', 'candle', 'delta', 'ember', 'forest', 'galaxy', 'harbor',
  'island', 'jungle', 'knight', 'lantern', 'meadow', 'nebula', 'ocean', 'prism',
  'quartz', 'river', 'summit', 'thunder',
];

const CHARSETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  numbers: '23456789',
  symbols: '!@#$%^&*-_=+',
  ambiguous: '0O1lI',
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function computePasswordHealth(state: DemoState) {
  const total = state.entries.length;
  const secretMap = new Map<string, number>();
  for (const e of state.entries) {
    secretMap.set(e.secret, (secretMap.get(e.secret) ?? 0) + 1);
  }
  const reused = [...secretMap.values()].filter((n) => n > 1).length;
  const now = Math.floor(Date.now() / 1000);
  const old = state.entries.filter((e) => now - e.created_at > 90 * 86400).length;
  const weak = state.entries.filter((e) => e.secret.length < 16).length;
  const favorites = state.entries.filter((e) => e.favorite).length;
  const categories = new Set(state.entries.map((e) => e.category)).size;
  const issues = reused + old + weak;
  const score = total === 0 ? 100 : Math.max(0, Math.round(100 - (issues / total) * 35));
  return {
    total_entries: total,
    strong_passwords: Math.max(0, total - weak),
    weak_passwords: weak,
    reused_secrets: reused,
    old_entries: old,
    favorite_entries: favorites,
    categories_count: categories,
    overall_score: score,
  };
}

function computeSecurityScore(state: DemoState): number {
  let score = 50;
  if (state.passwordHash) score += 15;
  if (state.pinHash) score += 5;
  if (state.recoveryCodes.some((c) => !c.used)) score += 10;
  if (state.enrolledQuestionIds.length >= 3) score += 10;
  if (state.settings.auto_lock) score += 5;
  if (state.settings.biometric) score += 5;
  return Math.min(100, score);
}

function checkStrength(password: string): [number, string] {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const idx = Math.min(labels.length - 1, Math.floor((score / 7) * labels.length));
  return [Math.min(100, Math.round((score / 7) * 100)), labels[idx]];
}

export const settingsHandlers: Record<string, DemoHandler> = {
  set_stealth_mode: (state, args) => {
    requireUnlocked(state);
    state.stealth = Boolean(args?.enabled);
  },

  get_stealth_mode: (state) => state.stealth,

  set_theme: (state, args) => {
    requireUnlocked(state);
    state.settings.theme = String(args?.theme ?? 'dark');
  },

  get_theme: (state) => state.settings.theme,

  set_language: (state, args) => {
    requireUnlocked(state);
    state.settings.language = String(args?.language ?? 'en');
  },

  get_language: (state) => state.settings.language ?? 'en',

  set_auto_lock: (state, args) => {
    requireUnlocked(state);
    state.settings.auto_lock = Boolean(args?.enabled);
    state.settings.lock_timeout_mins = Number(args?.timeoutMins ?? 5);
  },

  get_auto_lock_settings: (state) =>
    [state.settings.auto_lock, state.settings.lock_timeout_mins] as [boolean, number],

  get_settings: (state) => {
    requireUnlocked(state);
    return { ...state.settings };
  },

  update_settings: (state, args) => {
    requireUnlocked(state);
    const settings = args?.settings as DemoState['settings'] | undefined;
    if (settings) Object.assign(state.settings, settings);
  },

  set_timezone_offset: (state, args) => {
    requireUnlocked(state);
    state.timezoneOffset = Number(args?.offsetSeconds ?? 0);
  },

  get_timezone_offset: (state) => state.timezoneOffset,

  set_clock_drift: (state, args) => {
    requireUnlocked(state);
    state.clockDrift = Number(args?.driftSeconds ?? 0);
  },

  get_clock_drift: (state) => state.clockDrift,

  get_session_history: (state) => {
    requireUnlocked(state);
    return state.sessions;
  },

  revoke_session: (state, args) => {
    requireUnlocked(state);
    const sessionId = String(args?.sessionId ?? '');
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((s) => s.id !== sessionId);
    return state.sessions.length < before;
  },

  revoke_all_sessions: (state) => {
    requireUnlocked(state);
    const count = state.sessions.length;
    state.sessions = [];
    return count;
  },

  get_devices: (state) => {
    requireUnlocked(state);
    return state.devices;
  },

  add_device: (state, args) => {
    requireUnlocked(state);
    const device: DeviceEntry = {
      id: newId('dev'),
      name: String(args?.name ?? 'Device'),
      device_type: String(args?.deviceType ?? 'desktop'),
      os: String(args?.os ?? 'unknown'),
      last_active: nowTs(),
      trust_level: 1,
      is_current: false,
      ip_address: '127.0.0.1',
    };
    state.devices.push(device);
    return device;
  },

  remove_device: (state, args) => {
    requireUnlocked(state);
    const deviceId = String(args?.deviceId ?? '');
    state.devices = state.devices.filter((d) => d.id !== deviceId);
  },

  update_device_trust: (state, args) => {
    requireUnlocked(state);
    const deviceId = String(args?.deviceId ?? '');
    const trustLevel = Number(args?.trustLevel ?? 1);
    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    device.trust_level = trustLevel;
  },

  register_device: (state, args) => {
    requireUnlocked(state);
    const device: DeviceEntry = {
      id: newId('dev'),
      name: String(args?.name ?? 'Device'),
      device_type: String(args?.deviceType ?? 'desktop'),
      os: String(args?.os ?? 'unknown'),
      last_active: nowTs(),
      trust_level: 1,
      is_current: true,
      ip_address: '127.0.0.1',
    };
    state.devices.push(device);
    return device;
  },

  sync_device: (state, args) => {
    requireUnlocked(state);
    const deviceId = String(args?.deviceId ?? '');
    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    device.last_active = nowTs();
  },

  get_sessions: (state) => {
    requireUnlocked(state);
    if (state.sessions.length === 0 && state.unlocked) {
      const session: Session = {
        id: newId('sess'),
        device_id: state.devices.find((d) => d.is_current)?.id ?? state.devices[0]?.id ?? 'd1',
        ip: '127.0.0.1',
        location: 'Local',
        started_at: nowTs(),
        last_active: nowTs(),
        is_active: true,
      };
      state.sessions.push(session);
    }
    return state.sessions;
  },

  get_security_events: (state) => {
    requireUnlocked(state);
    return state.securityEvents;
  },

  add_security_event: (state, args) => {
    requireUnlocked(state);
    state.securityEvents.unshift({
      id: newId('evt'),
      event_type: String(args?.eventType ?? 'info'),
      message: String(args?.message ?? ''),
      timestamp: nowTs(),
      severity: String(args?.severity ?? 'info'),
    });
    if (state.securityEvents.length > 100) state.securityEvents.length = 100;
  },

  get_security_score: (state) => {
    requireUnlocked(state);
    return computeSecurityScore(state);
  },

  get_password_health: (state) => {
    requireUnlocked(state);
    return computePasswordHealth(state);
  },

  get_command_palette_items: () => [
    { id: 'lock', name: 'Lock Vault', description: 'Lock the vault immediately', category: 'Security', shortcut: 'Ctrl+L' },
    { id: 'add-entry', name: 'Add Entry', description: 'Create a new vault entry', category: 'Vault', shortcut: 'Ctrl+N' },
    { id: 'search', name: 'Search', description: 'Search vault entries', category: 'Vault', shortcut: 'Ctrl+F' },
    { id: 'settings', name: 'Settings', description: 'Open application settings', category: 'App', shortcut: null },
    { id: 'export', name: 'Export Backup', description: 'Export an encrypted backup', category: 'Backup', shortcut: null },
  ],

  generate_password: (_state, args) => {
    const length = Math.min(128, Math.max(4, Number(args?.length ?? 16)));
    const uppercase = args?.uppercase !== false;
    const lowercase = args?.lowercase !== false;
    const numbers = args?.numbers !== false;
    const symbols = args?.symbols !== false;
    const excludeAmbiguous = args?.excludeAmbiguous !== false;
    let pool = '';
    if (uppercase) pool += CHARSETS.upper;
    if (lowercase) pool += CHARSETS.lower;
    if (numbers) pool += CHARSETS.numbers;
    if (symbols) pool += CHARSETS.symbols;
    if (!pool) pool = CHARSETS.lower + CHARSETS.numbers;
    if (excludeAmbiguous) {
      for (const ch of CHARSETS.ambiguous) pool = pool.replaceAll(ch, '');
    }
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => pool[b % pool.length]).join('');
  },

  generate_passphrase: (_state, args) => {
    const wordCount = Math.min(20, Math.max(3, Number(args?.wordCount ?? 4)));
    const separator = String(args?.separator ?? '-');
    const capitalize = Boolean(args?.capitalize);
    const bytes = new Uint8Array(wordCount);
    crypto.getRandomValues(bytes);
    const words = Array.from(bytes, (b) => {
      const w = PASSPHRASE_WORDS[b % PASSPHRASE_WORDS.length];
      return capitalize ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    });
    return words.join(separator);
  },

  check_password_strength: (_state, args) => checkStrength(String(args?.password ?? '')),

  rotate_vault_key: async (state, args) => {
    requireUnlocked(state);
    const password = String(args?.password ?? '');
    await verifyMasterPassword(state, password);
    const pin = args?.pin as string | null | undefined;
    if (pin) state.pinHash = await hashPassword(pin);
    state.passwordHash = await hashPassword(password);
  },

  get_usage_statistics: (state) => {
    requireUnlocked(state);
    const mostUsed = Object.entries(state.entryUseCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) as [string, number][];
    return {
      total_logins: state.loginCount,
      most_used_entries: mostUsed,
      login_frequency: [['daily', state.loginCount]] as [string, number][],
      average_daily_usage: state.loginCount > 0 ? state.entries.length / state.loginCount : 0,
    };
  },
};
