// GenVault Backend API Bridge — Tauri IPC, or gated demo mode when NEXT_PUBLIC_GENVAULT_DEMO=true

import { isDemoMode } from './demo/flag';
import { generateTotpCode, verifyTotpCode, generateTotpSecret } from './totp-browser';

export interface User {
  id: string;
  username: string;
  display_name: string;
  created_at: number;
  last_login: number;
  is_onboarded: boolean;
  mfa_enabled: boolean;
  biometric_enabled: boolean;
  security_tier: string;
}

/** Vault entry metadata — TOTP secrets never leave the Rust backend. */
export interface VaultEntry {
  id: string;
  name: string;
  issuer: string;
  category: string;
  icon: string;
  color: string;
  digits: number;
  period: number;
  created_at: number;
  last_used: number;
  tags?: string[];
  favorite?: boolean;
  notes?: string;
  has_notes?: boolean;
  is_hotp?: boolean;
  hotp_counter?: number;
  custom_period?: number;
  custom_digits?: number;
  attachments?: EntryAttachmentMeta[];
}

export interface EntryAttachmentMeta {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: number;
}

export interface EntryTemplate {
  id: string;
  name: string;
  issuer: string;
  category: string;
  icon: string;
  color: string;
  digits: number;
  period: number;
  tags: string[];
}

export interface RemovableDrive {
  letter: string;
  label: string;
  free_bytes: number;
  total_bytes: number;
}

export interface HardwareSecurityKeyPublic {
  id: string;
  name: string;
  device_type: string;
  registered_at: number;
  last_used: number;
  unlock_enrolled: boolean;
}

export interface DeviceEntry {
  id: string;
  name: string;
  device_type: string;
  os: string;
  last_active: number;
  trust_level: number;
  is_current: boolean;
  ip_address: string;
}

export interface Session {
  id: string;
  device_id: string;
  ip: string;
  location: string;
  started_at: number;
  last_active: number;
  is_active: boolean;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  message: string;
  timestamp: number;
  severity: string;
}

export interface AppSettings {
  auto_lock: boolean;
  biometric: boolean;
  cloud_sync: boolean;
  theme: string;
  lock_timeout_mins: number;
  language?: string;
  ui_font?: string;
  hibp_audit_enabled?: boolean;
}

export interface OtpCode {
  code: string;
  seconds_remaining: number;
  period: number;
}

export interface UnlockInfo {
  exists: boolean;
  legacy: boolean;
  methods: string[];
}

export interface SecurityQuestion {
  id: string;
  question: string;
  category: string;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Normalize Tauri invoke rejections (often plain strings) into a user-visible message. */
export function invokeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>;
    for (const key of ['message', 'error', 'data', 'payload']) {
      const val = record[key];
      if (typeof val === 'string' && val.trim()) return val;
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') return json;
    } catch {
      // ignore
    }
  }
  return 'An unexpected error occurred';
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    try {
      return await tauriInvoke<T>(cmd, args);
    } catch (err) {
      throw new Error(invokeErrorMessage(err));
    }
  }
  if (isDemoMode()) {
    const { demoInvoke } = await import('./demo');
    return (await demoInvoke(cmd, args)) as T;
  }
  throw new Error('GenVault requires the GenVault application. Browser mode is disabled for security.');
}

export const api = {
  checkAccountExists: () => invoke<boolean>('check_account_exists'),
  getAuthScreenMode: () => invoke<'setup' | 'login'>('get_auth_screen_mode'),
  resetLocalAccount: () => invoke<void>('reset_local_account'),
  eraseVaultAndReset: (confirmation: string) =>
    invoke<void>('erase_vault_and_reset', { confirmation }),
  getLoginHint: () => invoke<string | null>('get_login_hint'),
  signUp: (username: string, displayName: string, masterPassword: string) =>
    invoke<User>('sign_up', {
      request: {
        username,
        displayName,
        masterPassword,
      },
    }),
  logIn: (username: string) => invoke<User>('log_in', { username }),
  logOut: () => invoke<void>('log_out'),
  lockVault: () => invoke<void>('lock_vault'),
  getUser: () => invoke<User | null>('get_user'),
  setupMasterPasswordFromLegacy: (password: string) =>
    invoke<User>('setup_master_password_from_legacy', { password }),

  getUnlockInfo: () => invoke<UnlockInfo>('get_unlock_info'),
  unlockWithPassword: (password: string) => invoke<User>('unlock_with_password', { password }),
  unlockWithPin: (pin: string) => invoke<User>('unlock_with_pin', { pin }),
  unlockWithHello: (password: string) => invoke<User>('unlock_with_hello', { password }),
  helloAvailable: () => invoke<boolean>('hello_available'),
  unlockWithSecurityKey: (keyId: string, password: string, pin?: string) =>
    invoke<User>('unlock_with_security_key', { keyId, password, pin: pin ?? null }),
  fidoAvailable: () => invoke<boolean>('fido_available'),
  getHardwareKeys: () => invoke<HardwareSecurityKeyPublic[]>('get_hardware_keys'),
  registerHardwareKey: (name: string, pin?: string) =>
    invoke<HardwareSecurityKeyPublic>('register_hardware_key', { name, pin: pin ?? null }),
  testHardwareKey: (keyId: string, pin?: string) =>
    invoke<void>('test_hardware_key', { keyId, pin: pin ?? null }),
  removeHardwareKey: (keyId: string) => invoke<void>('remove_hardware_key', { keyId }),
  setMasterPassword: (password: string) => invoke<void>('set_master_password', { password }),
  setPin: (pin: string) => invoke<void>('set_pin', { pin }),
  removePin: () => invoke<void>('remove_pin'),
  hasPin: () => invoke<boolean>('has_pin'),
  enrollHello: () => invoke<void>('enroll_hello'),
  removeUnlockMethod: (kind: string) => invoke<void>('remove_unlock_method', { kind }),
  setBiometricSettings: (enabled: boolean) => invoke<void>('set_biometric_settings', { enabled }),

  getSessionHistory: () => invoke<Session[]>('get_session_history'),
  revokeSession: (sessionId: string) => invoke<boolean>('revoke_session', { sessionId }),
  revokeAllSessions: () => invoke<number>('revoke_all_sessions'),

  setStealthMode: (enabled: boolean) => invoke<void>('set_stealth_mode', { enabled }),
  getStealthMode: () => invoke<boolean>('get_stealth_mode'),
  setTheme: (theme: string) => invoke<void>('set_theme', { theme }),
  getTheme: () => invoke<string>('get_theme'),

  getTemplates: () => invoke<EntryTemplate[]>('get_templates'),
  createEntryFromTemplate: (templateId: string, secret?: string) =>
    invoke<VaultEntry>('create_entry_from_template', { templateId, secret: secret ?? null }),
  getCommandPaletteItems: () => invoke<{ id: string; name: string; description: string; category: string; shortcut: string | null }[]>('get_command_palette_items'),
  getPasswordHealth: () => invoke<{ total_entries: number; strong_passwords: number; weak_passwords: number; reused_secrets: number; old_entries: number; favorite_entries: number; categories_count: number; overall_score: number }>('get_password_health'),

  updateCustomTotpParams: (entryId: string, customPeriod: number | null, customDigits: number | null) =>
    invoke<void>('update_custom_totp_params', { entryId, customPeriod, customDigits }),
  enableHotp: (entryId: string, initialCounter: number) => invoke<void>('enable_hotp', { entryId, initialCounter }),
  disableHotp: (entryId: string) => invoke<void>('disable_hotp', { entryId }),
  incrementHotpCounter: (entryId: string) => invoke<number>('increment_hotp_counter', { entryId }),
  setTimezoneOffset: (offsetSeconds: number) => invoke<void>('set_timezone_offset', { offsetSeconds }),
  getTimezoneOffset: () => invoke<number>('get_timezone_offset'),
  setClockDrift: (driftSeconds: number) => invoke<void>('set_clock_drift', { driftSeconds }),
  getClockDrift: () => invoke<number>('get_clock_drift'),
  registerDevice: (name: string, deviceType: string, os: string) => invoke<DeviceEntry>('register_device', { name, deviceType, os }),
  syncDevice: (deviceId: string) => invoke<void>('sync_device', { deviceId }),

  exportBackup: (passphrase: string) => invoke<string>('export_backup', { passphrase }),
  restoreBackup: (passphrase: string, backupJson: string) =>
    invoke<void>('restore_backup', { passphrase, backupJson }),
  completeOnboarding: () => invoke<void>('complete_onboarding'),
  updateUser: (displayName?: string, username?: string) =>
    invoke<User>('update_user', { displayName, username }),

  addVaultEntry: (params: {
    name: string; issuer: string; secret?: string; category: string;
    icon: string; color: string; digits?: number; period?: number;
  }) => invoke<VaultEntry>('add_vault_entry', params),
  removeVaultEntry: (entryId: string) => invoke<void>('remove_vault_entry', { entryId }),
  updateVaultEntry: (entryId: string, updates: { name?: string; issuer?: string; category?: string; notes?: string }) =>
    invoke<VaultEntry>('update_vault_entry', { entryId, ...updates }),
  getVaultEntries: () => invoke<VaultEntry[]>('get_vault_entries'),
  revealEntrySecret: (entryId: string, password: string) =>
    invoke<string>('reveal_entry_secret', { entryId, password }),
  revealEntryNotes: (entryId: string, password: string) =>
    invoke<string>('reveal_entry_notes', { entryId, password }),
  getVaultEntriesPage: (offset: number, limit: number) =>
    invoke<{ entries: VaultEntry[]; total: number; offset: number; limit: number }>('get_vault_entries_page', { offset, limit }),
  getVaultEntryCount: () => invoke<number>('get_vault_entry_count'),

  generateOtp: (entryId: string) => invoke<OtpCode>('generate_otp', { entryId }),
  verifyOtp: (entryId: string, code: string) => invoke<boolean>('verify_otp', { entryId, code }),
  generateTotpSecret: () => invoke<string>('generate_totp_secret'),
  getProvisioningUri: (entryId: string, password: string) =>
    invoke<string>('get_provisioning_uri', { entryId, password }),

  getDevices: () => invoke<DeviceEntry[]>('get_devices'),
  addDevice: (name: string, deviceType: string, os: string) =>
    invoke<DeviceEntry>('add_device', { name, deviceType, os }),
  removeDevice: (deviceId: string) => invoke<void>('remove_device', { deviceId }),
  updateDeviceTrust: (deviceId: string, trustLevel: number) =>
    invoke<void>('update_device_trust', { deviceId, trustLevel }),
  getSessions: () => invoke<Session[]>('get_sessions'),

  getSecurityEvents: () => invoke<SecurityEvent[]>('get_security_events'),
  addSecurityEvent: (eventType: string, message: string, severity: string) =>
    invoke<void>('add_security_event', { eventType, message, severity }),
  getSecurityScore: () => invoke<number>('get_security_score'),
  getSettings: () => invoke<AppSettings>('get_settings'),
  updateSettings: (settings: AppSettings) => invoke<void>('update_settings', { settings }),

  rotateVaultKey: (password: string, pin?: string) =>
    invoke<void>('rotate_vault_key', { password, pin: pin ?? null }),
  deleteAccount: (password: string) => invoke<void>('delete_account_cmd', { password }),
  exportVault: () => invoke<string>('export_vault'),

  getSecurityQuestions: () => invoke<SecurityQuestion[]>('get_security_questions'),
  getEnrolledSecurityQuestions: () => invoke<SecurityQuestion[]>('get_enrolled_security_questions'),
  getRandomSecurityQuestions: (count: number) => invoke<SecurityQuestion[]>('get_random_security_questions', { count }),
  enrollSecurityAnswers: (answers: [string, string][]) => invoke<void>('enroll_security_answers', { answers }),
  verifySecurityAnswers: (answers: [string, string][]) => invoke<boolean>('verify_security_answers', { answers }),
  verifySecurityAnswersForReset: (answers: [string, string][]) =>
    invoke<boolean>('verify_security_answers_for_reset', { answers }),
  resetPasswordWithSecurityAnswers: (username: string, newPassword: string, answers: [string, string][]) =>
    invoke<void>('reset_password_with_security_answers', { username, newPassword, answers }),
  hasSecurityQuestions: () => invoke<boolean>('has_security_questions'),

  generateAccountRecoveryCodes: () => invoke<string[]>('generate_account_recovery_codes'),
  regenerateAccountRecoveryCodes: () => invoke<string[]>('regenerate_account_recovery_codes'),
  hasAccountRecoveryCodes: () => invoke<boolean>('has_account_recovery_codes'),
  unusedAccountRecoveryCodesCount: () => invoke<number>('unused_account_recovery_codes_count'),
  verifyRecoveryCodeForReset: (code: string) => invoke<boolean>('verify_recovery_code_for_reset', { code }),
  resetPasswordWithRecoveryCode: (username: string, recoveryCode: string, newPassword: string) =>
    invoke<void>('reset_password_with_recovery_code', { username, recoveryCode, newPassword }),

  generatePassword: (length: number, uppercase: boolean, lowercase: boolean, numbers: boolean, symbols: boolean, excludeAmbiguous: boolean) =>
    invoke<string>('generate_password', { length, uppercase, lowercase, numbers, symbols, excludeAmbiguous }),
  generatePassphrase: (wordCount: number, separator: string, capitalize: boolean) =>
    invoke<string>('generate_passphrase', { wordCount, separator, capitalize }),
  checkPasswordStrength: (password: string) => invoke<[number, string]>('check_password_strength', { password }),

  importOtpauthUri: (uri: string, category: string) => invoke<VaultEntry>('import_otpauth_uri', { uri, category }),
  importGoogleAuthenticator: (json: string, category: string) => invoke<VaultEntry[]>('import_google_authenticator', { json, category }),
  importAuthyCsv: (csv: string, category: string) => invoke<VaultEntry[]>('import_authy_csv', { csv, category }),
  importManualEntry: (name: string, issuer: string, secret: string, category: string, digits?: number, period?: number) =>
    invoke<VaultEntry>('import_manual_entry', { name, issuer, secret, category, digits, period }),

  searchVaultEntries: (query: string) => invoke<VaultEntry[]>('search_vault_entries', { query }),
  filterVaultEntriesByCategory: (category: string) => invoke<VaultEntry[]>('filter_vault_entries_by_category', { category }),
  filterVaultEntriesByTags: (tags: string[]) => invoke<VaultEntry[]>('filter_vault_entries_by_tags', { tags }),
  getFavoriteEntries: () => invoke<VaultEntry[]>('get_favorite_entries'),
  toggleEntryFavorite: (entryId: string) => invoke<boolean>('toggle_entry_favorite', { entryId }),
  updateEntryTags: (entryId: string, tags: string[]) => invoke<void>('update_entry_tags', { entryId, tags }),

  generateEmergencyCodes: (count: number) => invoke<string[]>('generate_emergency_codes', { count }),
  getEmergencyCodes: () => invoke<[boolean, number][]>('get_emergency_codes'),
  useEmergencyCode: (code: string) => invoke<boolean>('use_emergency_code', { code }),
  hasEmergencyCodes: () => invoke<boolean>('has_emergency_codes'),

  runSecurityAudit: () => invoke<{
    weak_passwords: string[];
    reused_secrets: string[];
    old_entries: string[];
    compromised_credentials: string[];
    hibp_check_performed: boolean;
    hibp_error: string | null;
    total_entries: number;
    security_score: number;
  }>('run_security_audit'),
  checkPwnedPassword: (password: string) => invoke<number>('check_pwned_password', { password }),
  setAutoLock: (enabled: boolean, timeoutMins: number) => invoke<void>('set_auto_lock', { enabled, timeoutMins }),
  getAutoLockSettings: () => invoke<[boolean, number]>('get_auto_lock_settings'),

  exportVaultJson: () => invoke<string>('export_vault_json'),
  exportVaultSecrets: (password: string) =>
    invoke<string>('export_vault_secrets_json', { password }),
  exportVaultCsv: () => invoke<string>('export_vault_csv'),

  bulkDeleteEntries: (entryIds: string[]) => invoke<number>('bulk_delete_entries', { entryIds }),
  bulkUpdateCategory: (entryIds: string[], newCategory: string) => invoke<number>('bulk_update_category', { entryIds, newCategory }),
  bulkAddTags: (entryIds: string[], tags: string[]) => invoke<number>('bulk_add_tags', { entryIds, tags }),
  bulkRemoveTags: (entryIds: string[], tags: string[]) => invoke<number>('bulk_remove_tags', { entryIds, tags }),

  getAppVersion: () => invoke<string>('get_app_version'),
  getPlatform: () => invoke<string>('get_platform'),

  getUsageStatistics: () => invoke<{
    total_logins: number;
    most_used_entries: [string, number][];
    login_frequency: [string, number][];
    average_daily_usage: number;
  }>('get_usage_statistics'),

  createVaultTransfer: (passphrase: string) =>
    invoke<string>('create_vault_transfer', { passphrase }),
  importVaultTransfer: (passphrase: string, payload: string) =>
    invoke<number>('import_vault_transfer', { passphrase, payload }),

  getEntryHistory: (entryId?: string, limit = 50) =>
    invoke<{ id: string; entry_id: string; entry_name: string; action: string; field: string | null; old_value: string | null; new_value: string | null; timestamp: number }[]>(
      'get_entry_history',
      { entryId: entryId ?? null, limit }
    ),

  createVaultShare: (entryIds: string[], passphrase: string, expiresHours?: number) =>
    invoke<{ share_id: string; payload: string; entry_count: number; expires_at: number | null }>(
      'create_vault_share',
      { entryIds, passphrase, expiresHours: expiresHours ?? null }
    ),
  importVaultShare: (passphrase: string, payload: string) =>
    invoke<number>('import_vault_share', { passphrase, payload }),
  getVaultShares: () =>
    invoke<{ id: string; entry_names: string[]; created_at: number; expires_at: number | null; revoked: boolean; expired: boolean }[]>(
      'get_vault_shares'
    ),
  revokeVaultShare: (shareId: string) => invoke<void>('revoke_vault_share', { shareId }),

  setLanguage: (language: string) => invoke<void>('set_language', { language }),
  getLanguage: () => invoke<string>('get_language'),

  listEntryAttachments: (entryId: string) =>
    invoke<EntryAttachmentMeta[]>('list_entry_attachments', { entryId }),
  addEntryAttachment: (entryId: string, filename: string, mimeType: string, dataBase64: string) =>
    invoke<EntryAttachmentMeta>('add_entry_attachment', {
      entryId,
      filename,
      mimeType,
      dataBase64,
    }),
  removeEntryAttachment: (entryId: string, attachmentId: string) =>
    invoke<void>('remove_entry_attachment', { entryId, attachmentId }),
  exportEntryAttachment: (entryId: string, attachmentId: string, password: string) =>
    invoke<string>('export_entry_attachment', { entryId, attachmentId, password }),

  listRemovableDrives: () => invoke<RemovableDrive[]>('list_removable_drives'),
  exportBackupToUsb: (passphrase: string, driveLetter: string) =>
    invoke<string>('export_backup_to_usb', { passphrase, driveLetter }),
};

export { generateTotpCode, verifyTotpCode, generateTotpSecret };
