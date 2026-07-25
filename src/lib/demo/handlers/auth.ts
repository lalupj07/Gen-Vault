import type { User, UnlockInfo } from '@/lib/api';
import { hashPassword, verifyPassword } from '../crypto';
import { resetDemo } from '../store';
import type { DemoHandler, DemoState } from '../types';

const VAULT_ERASE_CONFIRMATION = 'DELETE MY VAULT';
const APP_VERSION = '1.5.0-demo';

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

function accountExists(state: DemoState): boolean {
  return !!state.user && !!state.passwordHash;
}

function requireUnlocked(state: DemoState): void {
  if (!state.unlocked) throw new Error('Vault is locked');
}

async function replaceStateFromReset(state: DemoState): Promise<void> {
  const fresh = await resetDemo();
  Object.assign(state, fresh);
}

async function unlockState(state: DemoState): Promise<User> {
  if (!state.user) throw new Error('No user account');
  state.unlocked = true;
  state.loginCount += 1;
  state.user.last_login = nowTs();
  return state.user;
}

async function verifyMasterPassword(state: DemoState, password: string): Promise<void> {
  if (!state.passwordHash || !(await verifyPassword(password, state.passwordHash))) {
    throw new Error('Invalid password');
  }
}

export const authHandlers: Record<string, DemoHandler> = {
  check_account_exists: (state) => accountExists(state),

  get_auth_screen_mode: (state) => (accountExists(state) ? 'login' : 'setup'),

  reset_local_account: async (state) => {
    await replaceStateFromReset(state);
  },

  erase_vault_and_reset: async (state, args) => {
    if (args?.confirmation !== VAULT_ERASE_CONFIRMATION) {
      throw new Error('Vault erase confirmation did not match.');
    }
    await replaceStateFromReset(state);
  },

  get_login_hint: (state) => (accountExists(state) ? state.user!.username : null),

  sign_up: async (state, args) => {
    if (accountExists(state)) {
      throw new Error('An account already exists on this device.');
    }
    const req = args?.request as
      | { username?: string; displayName?: string; masterPassword?: string }
      | undefined;
    const username = req?.username?.trim() ?? '';
    const displayName = req?.displayName?.trim() ?? '';
    const masterPassword = req?.masterPassword ?? '';
    if (!username) throw new Error('Username is required');
    if (!displayName) throw new Error('Display name is required');
    if (!masterPassword) throw new Error('Master password is required');

    const now = nowTs();
    state.user = {
      id: `demo-${now}`,
      username,
      display_name: displayName,
      created_at: now,
      last_login: now,
      is_onboarded: false,
      mfa_enabled: false,
      biometric_enabled: false,
      security_tier: 'standard',
    };
    state.passwordHash = await hashPassword(masterPassword);
    state.pinHash = null;
    state.unlocked = true;
    state.loginCount = 1;
    return state.user;
  },

  log_in: () => {
    throw new Error('Legacy login is disabled. Use your master password to unlock.');
  },

  log_out: (state) => {
    state.unlocked = false;
    state.sessions = [];
  },

  lock_vault: (state) => {
    state.unlocked = false;
  },

  get_user: (state) => state.user,

  setup_master_password_from_legacy: async (state, args) => {
    const password = String(args?.password ?? '');
    if (!password) throw new Error('Master password is required');
    if (!state.user) throw new Error('No user account');
    state.passwordHash = await hashPassword(password);
    return unlockState(state);
  },

  get_unlock_info: (state): UnlockInfo => {
    const methods: string[] = [];
    if (state.passwordHash) methods.push('password');
    if (state.pinHash) methods.push('pin');
    return {
      exists: !!state.user,
      legacy: !!state.user && !state.passwordHash,
      methods,
    };
  },

  unlock_with_password: async (state, args) => {
    const password = String(args?.password ?? '');
    await verifyMasterPassword(state, password);
    return unlockState(state);
  },

  unlock_with_pin: async (state, args) => {
    const pin = String(args?.pin ?? '');
    if (!state.pinHash || !(await verifyPassword(pin, state.pinHash))) {
      throw new Error('Invalid password');
    }
    return unlockState(state);
  },

  set_master_password: async (state, args) => {
    requireUnlocked(state);
    const password = String(args?.password ?? '');
    if (!password) throw new Error('Master password is required');
    state.passwordHash = await hashPassword(password);
  },

  set_pin: async (state, args) => {
    requireUnlocked(state);
    const pin = String(args?.pin ?? '');
    if (!pin) throw new Error('PIN is required');
    state.pinHash = await hashPassword(pin);
  },

  remove_pin: (state) => {
    requireUnlocked(state);
    state.pinHash = null;
  },

  has_pin: (state) => !!state.pinHash,

  complete_onboarding: (state) => {
    requireUnlocked(state);
    if (state.user) state.user.is_onboarded = true;
  },

  update_user: (state, args) => {
    requireUnlocked(state);
    if (!state.user) throw new Error('No user logged in');
    const displayName = args?.displayName as string | undefined;
    const username = args?.username as string | undefined;
    if (displayName !== undefined) state.user.display_name = displayName;
    if (username !== undefined) state.user.username = username;
    return state.user;
  },

  delete_account_cmd: async (state, args) => {
    requireUnlocked(state);
    const password = String(args?.password ?? '');
    await verifyMasterPassword(state, password);
    await replaceStateFromReset(state);
  },

  get_app_version: () => APP_VERSION,

  get_platform: () => 'demo-web',
};
