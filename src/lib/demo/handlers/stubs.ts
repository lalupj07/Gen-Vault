import type { DemoHandler, DemoState } from '../types';
import { requireUnlocked } from './vault';

const NA = 'Not available in browser demo';

export const stubHandlers: Record<string, DemoHandler> = {
  hello_available: () => false,
  fido_available: () => false,

  unlock_with_hello: () => {
    throw new Error(NA);
  },
  enroll_hello: () => {
    throw new Error(NA);
  },
  unlock_with_security_key: () => {
    throw new Error(NA);
  },
  register_hardware_key: () => {
    throw new Error(NA);
  },
  test_hardware_key: () => {
    throw new Error(NA);
  },

  get_hardware_keys: () => [],

  remove_hardware_key: () => undefined,

  remove_unlock_method: (state, args) => {
    requireUnlocked(state);
    const kind = String(args?.kind ?? '');
    if (kind === 'pin') state.pinHash = null;
  },

  set_biometric_settings: (state, args) => {
    requireUnlocked(state);
    state.settings.biometric = Boolean(args?.enabled);
    if (state.user) state.user.biometric_enabled = Boolean(args?.enabled);
  },

  list_removable_drives: () => [],

  export_backup_to_usb: () => {
    throw new Error(NA);
  },

  check_pwned_password: () => 0,

  run_security_audit: (state) => {
    requireUnlocked(state);
    const secretCounts = new Map<string, string[]>();
    for (const e of state.entries) {
      const list = secretCounts.get(e.secret) ?? [];
      list.push(e.id);
      secretCounts.set(e.secret, list);
    }
    const reused = [...secretCounts.values()].filter((ids) => ids.length > 1).flat();
    const now = Math.floor(Date.now() / 1000);
    const old = state.entries.filter((e) => now - e.created_at > 90 * 86400).map((e) => e.id);
    const weak = state.entries.filter((e) => e.secret.length < 16).map((e) => e.id);
    const total = state.entries.length;
    const issues = new Set([...reused, ...old, ...weak]).size;
    const score = total === 0 ? 100 : Math.max(0, Math.round(100 - (issues / total) * 40));
    return {
      weak_passwords: weak,
      reused_secrets: reused,
      old_entries: old,
      compromised_credentials: [],
      hibp_check_performed: false,
      hibp_error: 'Disabled in browser demo',
      total_entries: total,
      security_score: score,
    };
  },
};
