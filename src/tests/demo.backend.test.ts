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
