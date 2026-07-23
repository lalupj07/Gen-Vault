# Contributing to GenVault

Thanks for helping keep GenVault secure and usable.

## Rules

- **Security first** — never commit secrets, keystores, vault DBs, or real recovery codes.
- **Minimal diffs** — change only what the task needs.
- **No fake crypto claims** — document only what the code does.

## Setup

```bash
npm install
npm run tauri:dev
```

## Checks before a PR

```bash
npx tsc --noEmit
npm run test:security
cd src-tauri && cargo check
```

## Scope

Prefer issues/PRs that improve:

- Crypto / IPC / unlock hardening
- Offline UX (especially Android)
- Build / release reliability
- Accurate docs

Attach binaries to **Releases**, not to git.
