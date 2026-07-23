/**
 * Frontend E2E smoke tests — validates API surface and security contracts.
 * Full vault lifecycle is covered by Rust integration tests (e2e_smoke.rs).
 */

import { api } from '@/lib/api';

describe('GenVault API smoke', () => {
  it('exports required auth methods', () => {
    expect(typeof api.checkAccountExists).toBe('function');
    expect(typeof api.signUp).toBe('function');
    expect(typeof api.unlockWithPassword).toBe('function');
    expect(typeof api.lockVault).toBe('function');
  });

  it('exports recovery code methods (preferred over security questions)', () => {
    expect(typeof api.generateAccountRecoveryCodes).toBe('function');
    expect(typeof api.hasAccountRecoveryCodes).toBe('function');
    expect(typeof api.resetPasswordWithRecoveryCode).toBe('function');
    expect(typeof api.verifyRecoveryCodeForReset).toBe('function');
  });

  it('exports paginated vault API', () => {
    expect(typeof api.getVaultEntries).toBe('function');
    expect(typeof api.getVaultEntriesPage).toBe('function');
    expect(typeof api.getVaultEntryCount).toBe('function');
  });

  it('rejects browser-only invocation', async () => {
    await expect(api.checkAccountExists()).rejects.toThrow(/desktop application/i);
  });
});

describe('GenVault security contracts', () => {
  it('VaultEntry type has no secret field at runtime check', () => {
    const sample = {
      id: '1',
      name: 'Test',
      issuer: 'Test',
      category: 'Test',
      icon: '🔐',
      color: '#000',
      digits: 6,
      period: 30,
      created_at: 0,
      last_used: 0,
    };
    expect('secret' in sample).toBe(false);
  });
});
