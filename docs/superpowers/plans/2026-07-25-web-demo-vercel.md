# GenVault Web Demo (Vercel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a browser GenVault demo on Vercel so testers can exercise full product flows via one HTTPS link, without installing an APK.

**Architecture:** Branch `src/lib/api.ts` `invoke()` so that when Tauri is absent and `NEXT_PUBLIC_GENVAULT_DEMO=true`, calls route to an IndexedDB-backed demo backend under `src/lib/demo/`. Desktop/Android builds leave the flag unset and keep the current browser refusal. Static Next export (`out/`) deploys to Vercel with security headers and `noindex`.

**Tech Stack:** Next.js 14 static export, TypeScript, IndexedDB (memory fallback in Jest), existing `totp-browser` / `otplib`, Vercel static hosting.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-web-demo-vercel-design.md`.
- Never set `NEXT_PUBLIC_GENVAULT_DEMO` in desktop/Android release pipelines.
- Demo is not production crypto: no “zero-knowledge” / “encrypted at rest” copy for the demo.
- Seed data must be fabricated; never commit real secrets.
- No analytics / third-party trackers.
- HIBP network calls disabled in demo.
- Biometrics / Hello / FIDO / USB: soft stub messages only.
- Default seed unlock password for reset state: `DemoVault1!`
- IndexedDB name: `genvault-demo`; schema version: `1`.
- `get_platform` in demo returns `demo-web`.
- Mobile shell always when demo mode is on (`isAndroidShell` treats `demo-web` as mobile).

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/demo/flag.ts` | `isDemoMode()` — reads `NEXT_PUBLIC_GENVAULT_DEMO` |
| `src/lib/demo/types.ts` | `DemoState`, entry-with-secret, session fields |
| `src/lib/demo/store.ts` | Load/save/reset IndexedDB + memory fallback |
| `src/lib/demo/seed.ts` | `createSeedState()`, `SEED_PASSWORD` |
| `src/lib/demo/crypto.ts` | Demo password hash/verify (Web Crypto SHA-256, not Argon2) |
| `src/lib/demo/handlers/auth.ts` | Auth / unlock / lock / account commands |
| `src/lib/demo/handlers/vault.ts` | Vault CRUD, search, tags, bulk, attachments |
| `src/lib/demo/handlers/otp.ts` | TOTP/HOTP generate/verify/import |
| `src/lib/demo/handlers/settings.ts` | Settings, theme, language, devices, sessions, audit |
| `src/lib/demo/handlers/recovery.ts` | Recovery codes, security questions, emergency |
| `src/lib/demo/handlers/stubs.ts` | Hello/FIDO/USB soft failures |
| `src/lib/demo/handlers/backup.ts` | Backup / transfer / share JSON round-trips |
| `src/lib/demo/index.ts` | `demoInvoke(cmd, args)` |
| `src/lib/api.ts` | Demo branch inside `invoke()` |
| `src/lib/platform.ts` | Treat `demo-web` as mobile shell |
| `src/components/DemoBadge.tsx` | Persistent Demo badge + short disclaimer |
| `src/components/UnlockScreen.tsx` | Show badge/disclaimer when demo |
| `src/components/mobile/MobileSettings.tsx` | Reset demo control |
| `src/components/mobile/MobileAbout.tsx` | Demo disclaimer (if About exists; else Settings About block) |
| `src/app/page.tsx` / `MobileShell.tsx` | Mount `DemoBadge` when demo |
| `vercel.json` | Headers: CSP, frame deny, nosniff, noindex |
| `docs/DEMO_VERCEL.md` | How to deploy / tester password |
| `src/tests/demo.backend.test.ts` | Auth, CRUD, TOTP, reset |
| `src/tests/e2e.smoke.test.ts` | Keep refuse-without-flag; add demo-path smoke when flag mocked |

---

### Task 1: Demo flag, types, store, seed, demo hash

**Files:**
- Create: `src/lib/demo/flag.ts`
- Create: `src/lib/demo/types.ts`
- Create: `src/lib/demo/crypto.ts`
- Create: `src/lib/demo/seed.ts`
- Create: `src/lib/demo/store.ts`
- Test: `src/tests/demo.backend.test.ts`

**Interfaces:**
- Produces:
  - `isDemoMode(): boolean`
  - `SEED_PASSWORD = 'DemoVault1!'`
  - `createSeedState(): DemoState`
  - `loadState(): Promise<DemoState>`
  - `saveState(state: DemoState): Promise<void>`
  - `resetDemo(): Promise<DemoState>`
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Write failing store/seed test**

Create `src/tests/demo.backend.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test — expect FAIL (modules missing)**

Run: `npx jest --runTestsByPath src/tests/demo.backend.test.ts --verbose`  
Expected: FAIL — cannot find `@/lib/demo/seed` (or similar).

- [ ] **Step 3: Implement flag, types, crypto, seed, store**

`src/lib/demo/flag.ts`:

```typescript
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_GENVAULT_DEMO === 'true';
}
```

`src/lib/demo/types.ts`:

```typescript
import type {
  User, VaultEntry, AppSettings, DeviceEntry, Session, SecurityEvent,
  EntryAttachmentMeta, SecurityQuestion, EntryTemplate,
} from '@/lib/api';

export type DemoVaultEntry = VaultEntry & {
  secret: string;
  notes_plain?: string;
};

export type DemoAttachment = EntryAttachmentMeta & {
  dataBase64: string;
};

export interface DemoShare {
  id: string;
  entry_ids: string[];
  entry_names: string[];
  payload: string;
  created_at: number;
  expires_at: number | null;
  revoked: boolean;
}

export interface DemoHistoryRow {
  id: string;
  entry_id: string;
  entry_name: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  timestamp: number;
}

export interface DemoState {
  schemaVersion: 1;
  user: User | null;
  passwordHash: string | null;
  pinHash: string | null;
  unlocked: boolean;
  stealth: boolean;
  timezoneOffset: number;
  clockDrift: number;
  settings: AppSettings;
  entries: DemoVaultEntry[];
  attachments: Record<string, DemoAttachment[]>; // entryId -> list
  devices: DeviceEntry[];
  sessions: Session[];
  securityEvents: SecurityEvent[];
  recoveryCodes: { code: string; used: boolean }[];
  emergencyCodes: { code: string; used: boolean }[];
  securityAnswers: Record<string, string>; // questionId -> answer hash
  enrolledQuestionIds: string[];
  shares: DemoShare[];
  history: DemoHistoryRow[];
  loginCount: number;
  entryUseCounts: Record<string, number>;
}

export type DemoHandler = (
  state: DemoState,
  args: Record<string, unknown> | undefined,
) => Promise<unknown> | unknown;
```

`src/lib/demo/crypto.ts`:

```typescript
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Demo-only. Not Argon2. Never use for production vault. */
export async function hashPassword(password: string): Promise<string> {
  return sha256Hex(`genvault-demo|${password}`);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const next = await hashPassword(password);
  return next === hash;
}
```

`src/lib/demo/seed.ts`:

```typescript
import type { DemoState, DemoVaultEntry } from './types';
import { hashPassword } from './crypto';

export const SEED_PASSWORD = 'DemoVault1!';

function entry(
  partial: Omit<DemoVaultEntry, 'created_at' | 'last_used' | 'digits' | 'period'> & {
    digits?: number;
    period?: number;
  },
): DemoVaultEntry {
  const now = Date.now();
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
  const now = Math.floor(Date.now() / 1000);
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
```

`src/lib/demo/store.ts`:

```typescript
import type { DemoState } from './types';
import { createSeedState } from './seed';

const DB_NAME = 'genvault-demo';
const STORE = 'state';
const KEY = 'main';

let memory: DemoState | null = null;

function canUseIdb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<DemoState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as DemoState) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(state: DemoState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadState(): Promise<DemoState> {
  if (!canUseIdb()) {
    if (!memory) memory = await createSeedState();
    return structuredClone(memory);
  }
  let state = await idbGet();
  if (!state || state.schemaVersion !== 1) {
    state = await createSeedState();
    await idbSet(state);
  }
  memory = state;
  return structuredClone(state);
}

export async function saveState(state: DemoState): Promise<void> {
  memory = structuredClone(state);
  if (canUseIdb()) await idbSet(memory);
}

export async function resetDemo(): Promise<DemoState> {
  memory = null;
  if (canUseIdb()) await idbClear();
  const fresh = await createSeedState();
  await saveState(fresh);
  return structuredClone(fresh);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx jest --runTestsByPath src/tests/demo.backend.test.ts --verbose`  
Expected: PASS for store/seed/password tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/flag.ts src/lib/demo/types.ts src/lib/demo/crypto.ts src/lib/demo/seed.ts src/lib/demo/store.ts src/tests/demo.backend.test.ts
git commit -m "feat(demo): add IndexedDB store, seed, and demo password hash"
```

---

### Task 2: Wire `invoke()` demo gate + keep secure refusal

**Files:**
- Modify: `src/lib/api.ts` (the `invoke` function ~lines 158–168)
- Modify: `src/tests/e2e.smoke.test.ts`
- Create: `src/lib/demo/index.ts` (stub router that throws until Task 3)

**Interfaces:**
- Consumes: `isDemoMode()` from Task 1
- Produces: `demoInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>` (stub OK)

- [ ] **Step 1: Extend smoke tests**

In `src/tests/e2e.smoke.test.ts`, keep existing refuse test (flag off by default in Jest). Add:

```typescript
describe('GenVault demo gate', () => {
  const prev = process.env.NEXT_PUBLIC_GENVAULT_DEMO;

  afterEach(() => {
    process.env.NEXT_PUBLIC_GENVAULT_DEMO = prev;
    jest.resetModules();
  });

  it('still refuses browser invoke when demo flag is off', async () => {
    process.env.NEXT_PUBLIC_GENVAULT_DEMO = 'false';
    jest.resetModules();
    const { api: freshApi } = await import('@/lib/api');
    await expect(freshApi.checkAccountExists()).rejects.toThrow(
      /GenVault application|Browser mode is disabled for security/i,
    );
  });
});
```

- [ ] **Step 2: Run — refuse test must still PASS**

Run: `npx jest --runTestsByPath src/tests/e2e.smoke.test.ts --verbose`  
Expected: PASS (including refuse).

- [ ] **Step 3: Implement stub `demoInvoke` + branch in `api.ts`**

`src/lib/demo/index.ts` (temporary stub):

```typescript
export async function demoInvoke(cmd: string, _args?: Record<string, unknown>): Promise<unknown> {
  throw new Error(`Demo handler not implemented: ${cmd}`);
}
```

Replace `invoke` in `src/lib/api.ts`:

```typescript
import { isDemoMode } from './demo/flag';

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
```

Keep `isTauri` as-is. Prefer **dynamic** `import('./demo')` so non-demo bundles can tree-shake better (still OK if Next includes it when flag is compile-time true).

- [ ] **Step 4: Re-run smoke — PASS**

Run: `npx jest --runTestsByPath src/tests/e2e.smoke.test.ts --verbose`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/demo/index.ts src/tests/e2e.smoke.test.ts
git commit -m "feat(demo): gate browser invoke behind NEXT_PUBLIC_GENVAULT_DEMO"
```

---

### Task 3: Auth handlers + `demoInvoke` router core

**Files:**
- Create: `src/lib/demo/handlers/auth.ts`
- Modify: `src/lib/demo/index.ts`
- Modify: `src/tests/demo.backend.test.ts`

**Interfaces:**
- Consumes: `loadState`, `saveState`, `resetDemo`, `verifyPassword`, `hashPassword`, `SEED_PASSWORD`
- Produces: auth commands listed below registered in `demoInvoke`

Commands in this task:  
`check_account_exists`, `get_auth_screen_mode`, `reset_local_account`, `erase_vault_and_reset`, `get_login_hint`, `sign_up`, `log_in`, `log_out`, `lock_vault`, `get_user`, `setup_master_password_from_legacy`, `get_unlock_info`, `unlock_with_password`, `unlock_with_pin`, `set_master_password`, `set_pin`, `remove_pin`, `has_pin`, `complete_onboarding`, `update_user`, `delete_account_cmd`, `get_app_version`, `get_platform`

- [ ] **Step 1: Add failing auth flow test**

Append to `src/tests/demo.backend.test.ts`:

```typescript
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
    // after lock, get_user may still return user profile but vault locked — match UI needs:
    // unlock_with_password again works
    await expect(api.unlockWithPassword('wrong')).rejects.toThrow(/password|invalid/i);
  });

  it('erase_vault_and_reset restores seed', async () => {
    const { api } = await import('@/lib/api');
    const { SEED_PASSWORD } = await import('@/lib/demo/seed');
    await api.unlockWithPassword(SEED_PASSWORD);
    await api.eraseVaultAndReset('DELETE MY VAULT'); // matches VAULT_ERASE_CONFIRMATION in src/lib/vault-reset.ts
    expect(await api.checkAccountExists()).toBe(true);
    await api.unlockWithPassword(SEED_PASSWORD);
  });
});
```


Auth handler for `erase_vault_and_reset`: reject unless `args.confirmation === 'DELETE MY VAULT'`, then `resetDemo()` and replace state with the fresh seed.

- [ ] **Step 2: Run — expect FAIL (`Demo handler not implemented`)**

Run: `npx jest --runTestsByPath src/tests/demo.backend.test.ts --verbose`  
Expected: FAIL on unimplemented auth commands.

- [ ] **Step 3: Implement auth handlers + router**

`src/lib/demo/handlers/auth.ts` — implement each command so that:

- `check_account_exists` → `!!state.user && !!state.passwordHash`
- `get_auth_screen_mode` → account exists ? `'login'` : `'setup'`
- `unlock_with_password` → verify hash; set `unlocked=true`; bump `loginCount` / `last_login`; return `user`
- `lock_vault` / `log_out` → `unlocked=false` (log_out may clear session fields)
- `get_user` → return user if present (even when locked — match current app; if UI requires null when locked, return null when `!unlocked`)
- `sign_up` → create user + hash password from args (`request` object matching api.ts)
- `erase_vault_and_reset` / `reset_local_account` → `resetDemo()`
- `get_platform` → `'demo-web'`
- `get_app_version` → read from `package.json` version `1.5.0` hardcode string `'1.5.0-demo'` or `process.env.npm_package_version`
- `set_pin` / `has_pin` / `unlock_with_pin` → pinHash via `hashPassword`
- Wrong password → `throw new Error('Invalid password')`

`src/lib/demo/index.ts`:

```typescript
import { loadState, saveState } from './store';
import type { DemoHandler } from './types';
import { authHandlers } from './handlers/auth';

const handlers: Record<string, DemoHandler> = {
  ...authHandlers,
};

export async function demoInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const handler = handlers[cmd];
  if (!handler) throw new Error(`Demo handler not implemented: ${cmd}`);
  const state = await loadState();
  const result = await handler(state, args);
  await saveState(state);
  return result;
}
```

Export `authHandlers` as `Record<string, DemoHandler>`.

- [ ] **Step 4: Run demo tests — PASS**

Run: `npx jest --runTestsByPath src/tests/demo.backend.test.ts --verbose`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/handlers/auth.ts src/lib/demo/index.ts src/tests/demo.backend.test.ts
git commit -m "feat(demo): implement auth unlock/lock handlers"
```

---

### Task 4: Vault + OTP handlers

**Files:**
- Create: `src/lib/demo/handlers/vault.ts`
- Create: `src/lib/demo/handlers/otp.ts`
- Modify: `src/lib/demo/index.ts`
- Modify: `src/tests/demo.backend.test.ts`

**Interfaces:**
- Consumes: `generateTotpCode`, `verifyTotpCode`, `generateTotpSecret` from `@/lib/totp-browser`
- Produces: vault/otp commands registered

Vault/OTP commands:  
`get_vault_entries`, `get_vault_entries_page`, `get_vault_entry_count`, `add_vault_entry`, `remove_vault_entry`, `update_vault_entry`, `reveal_entry_secret`, `reveal_entry_notes`, `search_vault_entries`, `filter_vault_entries_by_category`, `filter_vault_entries_by_tags`, `get_favorite_entries`, `toggle_entry_favorite`, `update_entry_tags`, `bulk_delete_entries`, `bulk_update_category`, `bulk_add_tags`, `bulk_remove_tags`, `generate_otp`, `verify_otp`, `generate_totp_secret`, `get_provisioning_uri`, `import_otpauth_uri`, `import_manual_entry`, `import_google_authenticator`, `import_authy_csv`, `update_custom_totp_params`, `enable_hotp`, `disable_hotp`, `increment_hotp_counter`, `create_entry_from_template`, `get_templates`, `list_entry_attachments`, `add_entry_attachment`, `remove_entry_attachment`, `export_entry_attachment`

- [ ] **Step 1: Failing TOTP + CRUD test**

```typescript
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
```

- [ ] **Step 2: Run — FAIL unimplemented**

Run: `npx jest --runTestsByPath src/tests/demo.backend.test.ts --verbose`

- [ ] **Step 3: Implement vault + otp**

Rules:

- Public `VaultEntry` responses **must omit** `secret` / `notes_plain` (strip before return).
- `generate_otp`: look up secret; call `generateTotpCode(secret, period, digits)`; bump `last_used` + `entryUseCounts`.
- Locked vault: if `!state.unlocked`, throw `Vault is locked`.
- `import_otpauth_uri`: parse `otpauth://totp/...` query `secret`, `issuer`, label; add entry.
- `import_google_authenticator` / `import_authy_csv`: best-effort parse; if parse fails throw clear error; empty array OK for malformed demo input only if that matches product — prefer throw on total failure.
- Attachments: store base64 in `state.attachments[entryId]`; `export_entry_attachment` requires password verify.

Merge into `handlers` in `index.ts`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/handlers/vault.ts src/lib/demo/handlers/otp.ts src/lib/demo/index.ts src/tests/demo.backend.test.ts
git commit -m "feat(demo): vault CRUD and browser TOTP handlers"
```

---

### Task 5: Settings, recovery, backup, stubs — full command coverage

**Files:**
- Create: `src/lib/demo/handlers/settings.ts`
- Create: `src/lib/demo/handlers/recovery.ts`
- Create: `src/lib/demo/handlers/backup.ts`
- Create: `src/lib/demo/handlers/stubs.ts`
- Modify: `src/lib/demo/index.ts`

**Interfaces:**
- Produces: every remaining `api.ts` invoke command name must resolve (no `Demo handler not implemented`)

- [ ] **Step 1: Write coverage test that enumerates api commands**

```typescript
describe('demo command coverage', () => {
  it('registers every command string used by api.ts', async () => {
    process.env.NEXT_PUBLIC_GENVAULT_DEMO = 'true';
    jest.resetModules();
    const { listDemoCommands } = await import('@/lib/demo');
    // Export listDemoCommands(): string[] from index for this test
    const registered = new Set(listDemoCommands());
    const required = [
      // paste full list from api.ts invoke('...') first arguments — every command
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
```

- [ ] **Step 2: Run — FAIL until all registered**

- [ ] **Step 3: Implement remaining handlers**

**stubs.ts** (throw or soft values):

| Command | Behavior |
|---------|----------|
| `hello_available`, `fido_available` | `false` |
| `unlock_with_hello`, `enroll_hello`, `unlock_with_security_key`, `register_hardware_key`, `test_hardware_key` | throw `Not available in browser demo` |
| `get_hardware_keys` | `[]` |
| `remove_hardware_key`, `remove_unlock_method`, `set_biometric_settings` | no-op or throw as appropriate |
| `list_removable_drives` | `[]` |
| `export_backup_to_usb` | throw `Not available in browser demo` |
| `check_pwned_password` | return `0` (HIBP disabled) |
| `run_security_audit` | local heuristics; `hibp_check_performed: false`, `hibp_error: 'Disabled in browser demo'` |

**settings.ts:** theme, language, stealth, auto-lock, devices, sessions, security events/score, password health, command palette static list, timezone/clock, password generator (crypto.getRandomValues), passphrase (word list of ~20 demo words), `rotate_vault_key` re-hash with same password after verify.

**recovery.ts:** generate 10 recovery codes; store hashes or plaintext codes in demo state (plaintext OK for demo only); security questions from a fixed list of 5; emergency codes similarly.

**backup.ts:** `export_backup` / `restore_backup` JSON stringify/parse of entries+settings with passphrase gate (demo hash of passphrase stored in payload wrapper); shares/transfers as local JSON payloads; history append on mutations from vault handlers (optional hook).

Export `listDemoCommands()` from `index.ts` as `Object.keys(handlers)`.

- [ ] **Step 4: Coverage test PASS + smoke unlock→entries still PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/handlers/settings.ts src/lib/demo/handlers/recovery.ts src/lib/demo/handlers/backup.ts src/lib/demo/handlers/stubs.ts src/lib/demo/index.ts src/tests/demo.backend.test.ts
git commit -m "feat(demo): complete command coverage with stubs and backup"
```

---

### Task 6: Force mobile shell in demo mode

**Files:**
- Modify: `src/lib/platform.ts`
- Test: append to `src/tests/demo.backend.test.ts` or new `src/tests/demo.platform.test.ts`

**Interfaces:**
- Consumes: `api.getPlatform` → `demo-web`
- Produces: `isAndroidShell()` true when platform is `demo-web` or demo flag on

- [ ] **Step 1: Failing test**

```typescript
import { isDemoMode } from '@/lib/demo/flag';

describe('demo mobile shell', () => {
  it('treats demo-web as android shell', async () => {
    process.env.NEXT_PUBLIC_GENVAULT_DEMO = 'true';
    jest.resetModules();
    const { resetDemo } = await import('@/lib/demo/store');
    await resetDemo();
    const { isAndroidShell } = await import('@/lib/platform');
    // getOsPlatform will call demo get_platform
    await expect(isAndroidShell()).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

Update `src/lib/platform.ts`:

```typescript
export async function isAndroidShell(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    if (q.get('mobile') === '1') return true;
  }
  try {
    const { isDemoMode } = await import('./demo/flag');
    if (isDemoMode()) return true;
  } catch {
    // ignore
  }
  const os = await getOsPlatform();
  return os === 'android' || os === 'demo-web';
}
```

- [ ] **Step 3: Test PASS**

- [ ] **Step 4: Commit**

```bash
git add src/lib/platform.ts src/tests/demo.backend.test.ts
git commit -m "feat(demo): force mobile shell when demo mode is on"
```

---

### Task 7: Demo badge, disclaimer, Reset demo

**Files:**
- Create: `src/components/DemoBadge.tsx`
- Modify: `src/components/UnlockScreen.tsx` (add badge + disclaimer when demo)
- Modify: `src/components/mobile/MobileShell.tsx` (mount badge when unlocked UI shows)
- Modify: `src/components/mobile/MobileSettings.tsx` (Reset demo button)
- Modify: About surface if present (`MobileAbout.tsx`) — add disclaimer paragraph

**Interfaces:**
- Consumes: `isDemoMode()`, `resetDemo()` via `api.eraseVaultAndReset` or dedicated — prefer calling `api.eraseVaultAndReset` with the real confirmation string, then `window.location.reload()`
- Copy (exact):  
  - Badge label: `Demo`  
  - Disclaimer: `Browser demo only — not encrypted like the real GenVault app. Do not store real secrets.`  
  - Reset button: `Reset demo`

- [ ] **Step 1: Implement `DemoBadge.tsx`**

```tsx
'use client';

import { isDemoMode } from '@/lib/demo/flag';

export default function DemoBadge() {
  if (!isDemoMode()) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed top-3 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-violet-500/40 bg-zinc-950/90 px-3 py-1 text-xs font-semibold tracking-wide text-violet-200"
    >
      Demo
    </div>
  );
}
```

Use existing GenVault token colors if violet conflicts — match `--` CSS variables from the app; prefer existing accent token classes already used in mobile UI.

- [ ] **Step 2: UnlockScreen disclaimer**

Near the title/subtitle when `isDemoMode()`:

```tsx
{isDemoMode() && (
  <p className="mt-2 text-sm text-zinc-400">
    Browser demo only — not encrypted like the real GenVault app. Do not store real secrets.
  </p>
)}
```

Also show seed hint once: `Try password: DemoVault1!` only on seeded login mode (not after user changed password) — optional; if shown, keep small and muted.

- [ ] **Step 3: MobileSettings Reset demo**

Add a destructive button in the danger/account section:

```tsx
{isDemoMode() && (
  <button
    type="button"
    className="..." // match existing destructive styles in this file
    onClick={async () => {
      if (!confirm('Reset demo data? This clears this browser’s demo vault.')) return;
      await api.eraseVaultAndReset('DELETE MY VAULT');
      window.location.reload();
    }}
  >
    Reset demo
  </button>
)}
```

- [ ] **Step 4: Mount `DemoBadge` in `MobileShell` and desktop `page.tsx` shell** so it shows on all demo screens.

- [ ] **Step 5: Manual visual check** — `NEXT_PUBLIC_GENVAULT_DEMO=true npm run dev`, open localhost, confirm badge + mobile shell + unlock works.

- [ ] **Step 6: Commit**

```bash
git add src/components/DemoBadge.tsx src/components/UnlockScreen.tsx src/components/mobile/MobileShell.tsx src/components/mobile/MobileSettings.tsx src/app/page.tsx
git commit -m "feat(demo): badge, disclaimer, and reset demo control"
```

---

### Task 8: Vercel config + deployer docs

**Files:**
- Create: `vercel.json`
- Create: `docs/DEMO_VERCEL.md`
- Modify: `DEPLOYMENT.md` — add short pointer to `docs/DEMO_VERCEL.md`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "out",
  "framework": "nextjs",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        }
      ]
    }
  ]
}
```

Note: `unsafe-inline` / `unsafe-eval` may be required for Next; tighten later if build allows. Do **not** add analytics hosts to CSP.

- [ ] **Step 2: Write `docs/DEMO_VERCEL.md`**

Include:

1. Vercel project settings: Root `.`, Build `npm run build`, Output `out`.
2. Env var Production + Preview: `NEXT_PUBLIC_GENVAULT_DEMO=true`.
3. Tester password after reset: `DemoVault1!`
4. Explicit: not for real secrets; APK/Play still required for security testing.
5. Local preview: `NEXT_PUBLIC_GENVAULT_DEMO=true npm run build && npx serve out`

- [ ] **Step 3: Pointer in `DEPLOYMENT.md`**

Add a subsection **Web demo (Vercel)** linking to `docs/DEMO_VERCEL.md`.

- [ ] **Step 4: Local production build with flag**

Run:

```bash
$env:NEXT_PUBLIC_GENVAULT_DEMO='true'; npm run build
```

Expected: `out/` generated without errors.

- [ ] **Step 5: Commit**

```bash
git add vercel.json docs/DEMO_VERCEL.md DEPLOYMENT.md
git commit -m "chore(demo): add Vercel static config and deploy docs"
```

---

### Task 9: Acceptance smoke + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-web-demo-vercel-design.md` status → `Implemented — pending Vercel URL`
- Modify: `src/tests/e2e.smoke.test.ts` if needed

- [ ] **Step 1: Run full relevant Jest**

```bash
npx jest --runTestsByPath src/tests/demo.backend.test.ts src/tests/e2e.smoke.test.ts src/tests/security.test.ts --verbose
```

Expected: all PASS. Browser refuse still works with flag off.

- [ ] **Step 2: Manual checklist (local or Vercel preview)**

- [ ] Open link on Android Chrome  
- [ ] See Demo badge + mobile UI  
- [ ] Unlock with `DemoVault1!`  
- [ ] TOTP codes tick  
- [ ] Add entry  
- [ ] Change a setting  
- [ ] Export/restore backup (if UI exposes it)  
- [ ] Lock / unlock  
- [ ] Reset demo  

- [ ] **Step 3: Deploy** — operator runs `npx vercel --prod` (or Git integration) with env set; paste URL into `docs/DEMO_VERCEL.md`.

- [ ] **Step 4: Commit status + URL doc update**

```bash
git add docs/superpowers/specs/2026-07-25-web-demo-vercel-design.md docs/DEMO_VERCEL.md
git commit -m "docs(demo): mark web demo implemented and record tester URL"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Vercel static link | 8, 9 |
| Core tester flows | 3, 4, 5, 9 |
| Tauri unchanged without flag | 2, 9 |
| Demo badge + disclaimer + reset | 7 |
| IndexedDB + seed password | 1 |
| Mobile shell default | 6 |
| Stubs for native/HIBP | 5 |
| Security headers + noindex | 8 |
| Jest auth/CRUD/TOTP/reset | 1, 3, 4 |
| Full feature surface via link | 5 command coverage test |

**Resolved plan-time notes from spec:**

- Schema version `1`; incompatible → re-seed.  
- Mobile shell: always on when `isDemoMode()` (Task 6).  
- CSP: as in Task 8; allow inline for Next static; no third-party connect-src.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-25-web-demo-vercel.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  

**2. Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
