import type { DemoState, DemoVaultEntry } from './types';
import { hashPassword } from './crypto';

export const SEED_PASSWORD = 'DemoVault1!';

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

function entry(
  partial: Omit<DemoVaultEntry, 'created_at' | 'last_used' | 'digits' | 'period'> & {
    digits?: number;
    period?: number;
  },
): DemoVaultEntry {
  const now = nowTs();
  return {
    digits: 6,
    period: 30,
    created_at: now,
    last_used: now,
    tags: [],
    favorite: false,
    ...partial,
  };
}

export async function createSeedState(): Promise<DemoState> {
  const now = nowTs();
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const entries: DemoVaultEntry[] = [
    entry({ id: 'e1', name: 'Demo GitHub', issuer: 'GitHub', category: 'Work', icon: '🔑', color: '#8b5cf6', secret: 'JBSWY3DPEHPK3PXP' }),
    entry({ id: 'e2', name: 'Demo Google', issuer: 'Google', category: 'Personal', icon: '🔑', color: '#22d3ee', secret: 'KVKFKRCPNZQUYMLX' }),
    entry({ id: 'e3', name: 'Demo Amazon', issuer: 'Amazon', category: 'Shopping', icon: '🔑', color: '#f59e0b', secret: 'MFRGGZDFMZTWQ2LK' }),
    entry({ id: 'e4', name: 'Demo Slack', issuer: 'Slack', category: 'Work', icon: '🔑', color: '#a78bfa', secret: 'NBSWY3DPORUGK4T', favorite: true }),
    entry({ id: 'e5', name: 'Demo Bank', issuer: 'Demo Bank', category: 'Finance', icon: '🔑', color: '#34d399', secret: 'ONSWG4TFOQ======' }),
    entry({ id: 'e6', name: 'Demo Cloud', issuer: 'CloudCo', category: 'Work', icon: '🔑', color: '#60a5fa', secret: 'NBSWY3DPORUGK4ZA' }),
  ];

  return {
    schemaVersion: 1,
    user: {
      id: 'demo-user',
      username: 'demo',
      display_name: 'Demo Tester',
      created_at: now,
      last_login: now,
      is_onboarded: true,
      mfa_enabled: false,
      biometric_enabled: false,
      security_tier: 'standard',
    },
    passwordHash,
    pinHash: null,
    unlocked: false,
    stealth: false,
    timezoneOffset: 0,
    clockDrift: 0,
    settings: {
      auto_lock: true,
      biometric: false,
      cloud_sync: false,
      theme: 'dark',
      lock_timeout_mins: 5,
      language: 'en',
      hibp_audit_enabled: false,
    },
    entries,
    attachments: {},
    devices: [{
      id: 'd1', name: 'Demo Browser', device_type: 'mobile', os: 'demo-web',
      last_active: now, trust_level: 1, is_current: true, ip_address: '127.0.0.1',
    }],
    sessions: [],
    securityEvents: [],
    recoveryCodes: [],
    emergencyCodes: [],
    securityAnswers: {},
    enrolledQuestionIds: [],
    shares: [],
    history: [],
    loginCount: 0,
    entryUseCounts: {},
  };
}
