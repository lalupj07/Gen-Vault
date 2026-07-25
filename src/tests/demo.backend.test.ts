import { createSeedState, SEED_PASSWORD } from '@/lib/demo/seed';
import { resetDemo, loadState, saveState } from '@/lib/demo/store';
import { hashPassword, verifyPassword } from '@/lib/demo/crypto';

describe('demo store + seed', () => {
  beforeEach(async () => {
    await resetDemo();
  });

  it('seeds a user and vault entries', async () => {
    const state = await loadState();
    expect(state.user).not.toBeNull();
    expect(state.entries.length).toBeGreaterThanOrEqual(6);
    expect(state.schemaVersion).toBe(1);
  });

  it('verifies SEED_PASSWORD against seeded hash', async () => {
    const state = await loadState();
    expect(state.passwordHash).toBeTruthy();
    await expect(verifyPassword(SEED_PASSWORD, state.passwordHash!)).resolves.toBe(true);
    await expect(verifyPassword('wrong', state.passwordHash!)).resolves.toBe(false);
  });

  it('persists mutations via saveState', async () => {
    const state = await loadState();
    state.settings.theme = 'light';
    await saveState(state);
    const again = await loadState();
    expect(again.settings.theme).toBe('light');
  });
});

describe('demo auth', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_GENVAULT_DEMO = 'true';
    jest.resetModules();
    const { resetDemo } = await import('@/lib/demo/store');
    await resetDemo();
  });

  it('unlocks with seed password and locks', async () => {
    const { api } = await import('@/lib/api');
    const { SEED_PASSWORD } = await import('@/lib/demo/seed');
    expect(await api.checkAccountExists()).toBe(true);
    expect(await api.getAuthScreenMode()).toBe('login');
    const user = await api.unlockWithPassword(SEED_PASSWORD);
    expect(user.username).toBe('demo');
    expect(await api.getUser()).not.toBeNull();
    await api.lockVault();
    await expect(api.unlockWithPassword('wrong')).rejects.toThrow(/password|invalid/i);
  });

  it('erase_vault_and_reset restores seed', async () => {
    const { api } = await import('@/lib/api');
    const { SEED_PASSWORD } = await import('@/lib/demo/seed');
    await api.unlockWithPassword(SEED_PASSWORD);
    await api.eraseVaultAndReset('DELETE MY VAULT');
    expect(await api.checkAccountExists()).toBe(true);
    await api.unlockWithPassword(SEED_PASSWORD);
  });
});

describe('demo vault + otp', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_GENVAULT_DEMO = 'true';
    jest.resetModules();
    const { resetDemo } = await import('@/lib/demo/store');
    await resetDemo();
    const { api } = await import('@/lib/api');
    const { SEED_PASSWORD } = await import('@/lib/demo/seed');
    await api.unlockWithPassword(SEED_PASSWORD);
  });

  it('lists entries and generates 6-digit TOTP', async () => {
    const { api } = await import('@/lib/api');
    const entries = await api.getVaultEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).not.toHaveProperty('secret');
    const otp = await api.generateOtp(entries[0].id);
    expect(otp.code).toMatch(/^\d{6}$/);
    expect(otp.period).toBe(30);
  });

  it('adds and removes an entry', async () => {
    const { api } = await import('@/lib/api');
    const created = await api.addVaultEntry({
      name: 'New', issuer: 'Test', secret: 'JBSWY3DPEHPK3PXP',
      category: 'Work', icon: '🔑', color: '#fff',
    });
    expect(created.name).toBe('New');
    await api.removeVaultEntry(created.id);
    const ids = (await api.getVaultEntries()).map((e) => e.id);
    expect(ids).not.toContain(created.id);
  });
});

describe('demo command coverage', () => {
  it('registers every command string used by api.ts', async () => {
    process.env.NEXT_PUBLIC_GENVAULT_DEMO = 'true';
    jest.resetModules();
    const { listDemoCommands } = await import('@/lib/demo');
    const registered = new Set(listDemoCommands());
    const required = [
      'check_account_exists', 'get_auth_screen_mode', 'reset_local_account', 'erase_vault_and_reset',
      'get_login_hint', 'sign_up', 'log_in', 'log_out', 'lock_vault', 'get_user',
      'setup_master_password_from_legacy', 'get_unlock_info', 'unlock_with_password', 'unlock_with_pin',
      'unlock_with_hello', 'hello_available', 'unlock_with_security_key', 'fido_available',
      'get_hardware_keys', 'register_hardware_key', 'test_hardware_key', 'remove_hardware_key',
      'set_master_password', 'set_pin', 'remove_pin', 'has_pin', 'enroll_hello', 'remove_unlock_method',
      'set_biometric_settings', 'get_session_history', 'revoke_session', 'revoke_all_sessions',
      'set_stealth_mode', 'get_stealth_mode', 'set_theme', 'get_theme', 'get_templates',
      'create_entry_from_template', 'get_command_palette_items', 'get_password_health',
      'update_custom_totp_params', 'enable_hotp', 'disable_hotp', 'increment_hotp_counter',
      'set_timezone_offset', 'get_timezone_offset', 'set_clock_drift', 'get_clock_drift',
      'register_device', 'sync_device', 'export_backup', 'restore_backup', 'complete_onboarding',
      'update_user', 'add_vault_entry', 'remove_vault_entry', 'update_vault_entry', 'get_vault_entries',
      'reveal_entry_secret', 'reveal_entry_notes', 'get_vault_entries_page', 'get_vault_entry_count',
      'generate_otp', 'verify_otp', 'generate_totp_secret', 'get_provisioning_uri',
      'get_devices', 'add_device', 'remove_device', 'update_device_trust', 'get_sessions',
      'get_security_events', 'add_security_event', 'get_security_score', 'get_settings', 'update_settings',
      'rotate_vault_key', 'delete_account_cmd', 'export_vault',
      'get_security_questions', 'get_enrolled_security_questions', 'get_random_security_questions',
      'enroll_security_answers', 'verify_security_answers', 'verify_security_answers_for_reset',
      'reset_password_with_security_answers', 'has_security_questions',
      'generate_account_recovery_codes', 'regenerate_account_recovery_codes', 'has_account_recovery_codes',
      'unused_account_recovery_codes_count', 'verify_recovery_code_for_reset', 'reset_password_with_recovery_code',
      'generate_password', 'generate_passphrase', 'check_password_strength',
      'import_otpauth_uri', 'import_google_authenticator', 'import_authy_csv', 'import_manual_entry',
      'search_vault_entries', 'filter_vault_entries_by_category', 'filter_vault_entries_by_tags',
      'get_favorite_entries', 'toggle_entry_favorite', 'update_entry_tags',
      'generate_emergency_codes', 'get_emergency_codes', 'use_emergency_code', 'has_emergency_codes',
      'run_security_audit', 'check_pwned_password', 'set_auto_lock', 'get_auto_lock_settings',
      'export_vault_json', 'export_vault_secrets_json', 'export_vault_csv',
      'bulk_delete_entries', 'bulk_update_category', 'bulk_add_tags', 'bulk_remove_tags',
      'get_app_version', 'get_platform', 'get_usage_statistics',
      'create_vault_transfer', 'import_vault_transfer', 'get_entry_history',
      'create_vault_share', 'import_vault_share', 'get_vault_shares', 'revoke_vault_share',
      'set_language', 'get_language',
      'list_entry_attachments', 'add_entry_attachment', 'remove_entry_attachment', 'export_entry_attachment',
      'list_removable_drives', 'export_backup_to_usb',
    ];
    for (const cmd of required) {
      expect(registered.has(cmd)).toBe(true);
    }
  });
});
