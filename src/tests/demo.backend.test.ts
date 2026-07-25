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
