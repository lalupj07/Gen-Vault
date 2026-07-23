# GenVault Android Play Wave 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GenVault Android Play-uploadable: legal docs, in-app About/Support links, splash, release hygiene, store listing pack — without adding Autofill or W1–W4 features.

**Architecture:** Keep Tauri 2 + Next.js WebView + Rust vault unchanged. Wave 0 touches `store/` legal/listing docs, mobile About UI, Android theme splash, Jest discoverability, and a Play readiness checklist. No new crypto; no analytics SDKs.

**Tech Stack:** Next.js 14 static export, Tauri 2 Android (`com.genxis.genvault`), Kotlin MainActivity, Gradle R8, Markdown in `store/`.

## Global Constraints

- Security over convenience; never store TOTP seeds or master password unencrypted.
- Never commit keystores, Play JSON keys, or secrets.
- No analytics/crash SDKs; no ads; no IAP in Wave 0.
- Skip root/emulator detection and certificate pinning.
- Release cleartext traffic remains off; HIBP stays optional and user-initiated.
- Package `com.genxis.genvault`; product GenVault 1.0.0; support `genxisinnovation@outlook.com`.
- Spec: `docs/superpowers/specs/2026-07-22-android-play-wave0-design.md`.
- Do not implement W1–W4 features in this plan.

## File map

| File | Responsibility |
|------|----------------|
| `store/PRIVACY_POLICY.md` | Android + Windows privacy (Keystore, biometrics, camera, Play) |
| `store/TERMS_OF_USE.md` | Short terms (new) |
| `store/PLAY_LISTING.md` | Play short/full description + asset checklist (new) |
| `store/PLAY_DATA_SAFETY.md` | Data Safety form answers (new) |
| `store/PLAY_SIGNING.md` | Signing steps without secrets (new) |
| `src/lib/company.ts` | Add `privacyUrl`, `termsUrl` constants |
| `src/components/mobile/MobileAbout.tsx` | Mobile About / legal / support (new) |
| `src/components/mobile/MobileShell.tsx` | Wire More → About |
| `src/components/mobile/MobileSettings.tsx` | Link to About; show version |
| `src/components/OnboardingFlow.tsx` | Platform-neutral biometric copy |
| `src/lib/welcomeTour.ts` | Mobile-safe tour text |
| `src-tauri/gen/android/.../themes.xml` (+ night) | Splash window background |
| `src-tauri/gen/android/.../colors.xml` | Splash colors (new if missing) |
| `jest.config.js` | Discover `src/tests/**/*.test.ts` |

---

### Task 1: Legal docs — Privacy (Android) + Terms

**Files:**
- Modify: `store/PRIVACY_POLICY.md`
- Create: `store/TERMS_OF_USE.md`

**Interfaces:**
- Produces: Markdown ready to publish at HTTPS; in-app will link via `COMPANY.privacyUrl` / `COMPANY.termsUrl` (Task 2).

- [ ] **Step 1: Update Privacy Policy for Android**

In `store/PRIVACY_POLICY.md`:

1. Change intro from “Windows only” to “Windows desktop and Android”.
2. Add local Android storage note (app private storage / Tauri data dir).
3. In §4 (device features), add rows:

| Feature | Purpose |
|--------|---------|
| **Android biometrics / device credential** | Convenience unlock via BiometricPrompt + Android Keystore-wrapped protector (opt-in) |
| **Camera** | Optional QR scanning for otpauth enrollment (permission on use) |

4. Add section **Google Play**: Play may collect install/update data under Google’s policy; separate from GenXis.
5. Keep HIBP k-anonymity section unchanged in substance.
6. Bump **Last updated** to 2026-07-22.

- [ ] **Step 2: Create Terms of Use**

Create `store/TERMS_OF_USE.md` with:

- Effective date 2026-07-22
- GenVault is offline-first; GenXis does not host your vault
- You are responsible for master password, recovery, and backups
- No warranty for data loss if you forget credentials or skip backups
- Optional HIBP is third-party
- Contact: genxisinnovation@outlook.com
- License note: app ships with MIT/Apache components as disclosed in About

Keep under ~2 pages.

- [ ] **Step 3: Commit**

```bash
git add store/PRIVACY_POLICY.md store/TERMS_OF_USE.md
git commit -m "docs: Android-aware privacy policy and terms of use"
```

---

### Task 2: Company URLs + Mobile About screen

**Files:**
- Modify: `src/lib/company.ts`
- Create: `src/components/mobile/MobileAbout.tsx`
- Modify: `src/components/mobile/MobileShell.tsx`
- Modify: `src/components/mobile/MobileSettings.tsx`

**Interfaces:**
- Consumes: `PRODUCT`, `COMPANY` from `@/lib/company`
- Produces: More item `about` → `MobileAbout`; settings footer links to About

- [ ] **Step 1: Extend company metadata**

In `src/lib/company.ts` add:

```ts
export const COMPANY = {
  name: 'GenXis Innovations',
  email: 'genxisinnovation@outlook.com',
  website: 'https://www.genxisinnovation.in',
  websiteDisplay: 'www.genxisinnovation.in',
  // Publish these paths on the site before Play submit (content mirrors store/*.md)
  privacyUrl: 'https://www.genxisinnovation.in/privacy',
  termsUrl: 'https://www.genxisinnovation.in/terms',
  copyright: '© 2025 GenXis Innovations. All rights reserved.',
  licenses: ['Apache License 2.0', 'MIT License'] as const,
  licenseSpdx: 'MIT',
} as const;
```

- [ ] **Step 2: Create MobileAbout**

Create `src/components/mobile/MobileAbout.tsx`:

```tsx
'use client';

import { ExternalLink, Mail, Shield } from 'lucide-react';
import { COMPANY, PRODUCT } from '@/lib/company';

export default function MobileAbout() {
  return (
    <div className="space-y-5 pt-2 pb-4">
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-cyber-cyan/15 flex items-center justify-center">
          <Shield className="w-6 h-6 text-cyber-cyan" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-vault-light">{PRODUCT.name}</h2>
          <p className="text-xs text-vault-muted">v{PRODUCT.version}</p>
        </div>
      </div>
      <p className="text-sm text-vault-muted">{PRODUCT.tagline}</p>
      <p className="text-xs text-vault-muted">
        Offline authentication vault · AES-256-GCM · Argon2id · No analytics by default
      </p>
      <ul className="rounded-2xl bg-vault-panel border border-vault-border divide-y divide-vault-border">
        <li>
          <a
            href={COMPANY.privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between min-h-[52px] px-4 text-sm text-vault-light"
          >
            Privacy Policy <ExternalLink className="w-4 h-4 text-vault-muted" />
          </a>
        </li>
        <li>
          <a
            href={COMPANY.termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between min-h-[52px] px-4 text-sm text-vault-light"
          >
            Terms of Use <ExternalLink className="w-4 h-4 text-vault-muted" />
          </a>
        </li>
        <li>
          <a
            href={`mailto:${COMPANY.email}?subject=GenVault%20Support`}
            className="flex items-center justify-between min-h-[52px] px-4 text-sm text-vault-light"
          >
            Contact / Support <Mail className="w-4 h-4 text-vault-muted" />
          </a>
        </li>
        <li>
          <a
            href={COMPANY.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between min-h-[52px] px-4 text-sm text-vault-light"
          >
            {COMPANY.websiteDisplay} <ExternalLink className="w-4 h-4 text-vault-muted" />
          </a>
        </li>
      </ul>
      <p className="text-[11px] text-vault-muted">{COMPANY.name} · {COMPANY.copyright}</p>
    </div>
  );
}
```

- [ ] **Step 3: Wire More → About in MobileShell**

1. Import `MobileAbout` and an icon (`Info`).
2. Add to `MORE_ITEMS`:

```ts
{ id: 'about', label: 'About & legal', icon: Info, section: 'System' },
```

3. In the feature view switch, `case 'about': return <MobileAbout />;`

4. In `MobileSettings` About footer section, add a button “About & legal” that calls a new optional prop `onOpenAbout?: () => void`, or replace the static Info block with links matching MobileAbout (prefer navigating via shell: pass `onOpenAbout` from shell when rendering settings).

Minimal shell wiring when rendering settings:

```tsx
<MobileSettings onRefresh={refresh} onOpenAbout={() => goFeature('about')} />
```

And in settings footer button `onClick={onOpenAbout}`.

- [ ] **Step 4: Verify TypeScript build**

Run: `npm run build`  
Expected: Compiled successfully (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/lib/company.ts src/components/mobile/MobileAbout.tsx src/components/mobile/MobileShell.tsx src/components/mobile/MobileSettings.tsx
git commit -m "feat(android): About & legal screen with Privacy/Terms/Support links"
```

---

### Task 3: Android splash + onboarding copy cleanup

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/res/values/themes.xml`
- Modify: `src-tauri/gen/android/app/src/main/res/values-night/themes.xml`
- Create: `src-tauri/gen/android/app/src/main/res/values/colors.xml` (if missing)
- Modify: `src/components/OnboardingFlow.tsx`
- Modify: `src/lib/welcomeTour.ts`

**Interfaces:**
- Produces: Non-white splash; platform-neutral biometric strings on onboarding/tour

- [ ] **Step 1: Add splash colors**

Create or update `src-tauri/gen/android/app/src/main/res/values/colors.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="genvault_splash_bg">#0A0A0B</color>
    <color name="genvault_splash_bg_night">#000000</color>
</resources>
```

- [ ] **Step 2: Theme splash background**

`values/themes.xml`:

```xml
<resources xmlns:tools="http://schemas.android.com/tools">
    <style name="Theme.genvault" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <item name="android:windowBackground">@color/genvault_splash_bg</item>
        <item name="android:statusBarColor">@color/genvault_splash_bg</item>
        <item name="android:navigationBarColor">@color/genvault_splash_bg</item>
    </style>
</resources>
```

`values-night/themes.xml`: use `@color/genvault_splash_bg_night` for the same three items.

Do **not** add concentric ring drawables.

- [ ] **Step 3: Fix onboarding biometric copy**

In `OnboardingFlow.tsx` step that mentions Windows Hello, change to:

```ts
subtitle: 'Password, PIN, or biometrics',
description:
  'Layered security with master password, PIN, and optional fingerprint or face unlock. Your vault, your unlock method.',
```

In `welcomeTour.ts` settings step description, replace Windows Hello / FIDO2 / USB with:

```ts
'Configure auto-lock, biometric unlock, backup, import/export, and replay this tour anytime.',
```

Leave desktop-only SecondaryViews “Windows Hello” labels for Windows builds (optional later: gate with platform detect — **out of scope** unless easy; Wave 0 only requires mobile onboarding/tour).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/gen/android/app/src/main/res/values/colors.xml \
  src-tauri/gen/android/app/src/main/res/values/themes.xml \
  src-tauri/gen/android/app/src/main/res/values-night/themes.xml \
  src/components/OnboardingFlow.tsx src/lib/welcomeTour.ts
git commit -m "feat(android): splash theme and platform-neutral onboarding copy"
```

---

### Task 4: Play listing + Data Safety + signing docs

**Files:**
- Create: `store/PLAY_LISTING.md`
- Create: `store/PLAY_DATA_SAFETY.md`
- Create: `store/PLAY_SIGNING.md`

**Interfaces:**
- Produces: Copy-paste content for Play Console (no secrets)

- [ ] **Step 1: PLAY_LISTING.md**

Include:

- App name: GenVault  
- Short description (≤80 chars for Play): offline 2FA vault, encrypted local storage, no cloud  
- Full description bullets: offline TOTP, AES-256-GCM, Argon2id, biometric unlock, encrypted backup/import, QR, time-sync warning, no analytics by default, open-source crypto libs  
- Category suggestion: Tools / Security  
- Support email + website + privacy/terms URLs  
- Asset checklist: feature graphic 1024×500, phone screenshots (unlock, codes, vault, About), icon  

Note: screenshots are captured later on device — list required shots; do not fabricate image binaries in repo unless designer provides them.

- [ ] **Step 2: PLAY_DATA_SAFETY.md**

Answer table:

| Question | Answer |
|----------|--------|
| Collects personal info? | Yes — credentials/TOTP stored **on device only** |
| Shared with GenXis? | No |
| Encrypted in transit? | N/A for vault; HIBP uses HTTPS when user runs check |
| Encrypted at rest? | Yes |
| Users can request deletion? | Delete app data / uninstall |
| Ads? | No |
| Optional HIBP | Disclosed; hash prefix only |

- [ ] **Step 3: PLAY_SIGNING.md**

Steps only:

1. Create upload keystore **outside repo** (`keytool ...`).  
2. Enable Play App Signing in Console.  
3. Upload AAB signed with upload key.  
4. Store keystore + passwords in team password manager — never git.  
5. Document `versionCode` bump rule.

Do not put passwords or keystore paths with secrets in the file.

- [ ] **Step 4: Commit**

```bash
git add store/PLAY_LISTING.md store/PLAY_DATA_SAFETY.md store/PLAY_SIGNING.md
git commit -m "docs: Play listing, Data Safety answers, and signing guide"
```

---

### Task 5: Jest discovery + release hygiene checklist

**Files:**
- Modify: `jest.config.js`
- Create: `store/PLAY_PRE_SUBMIT_CHECKLIST.md`

**Interfaces:**
- Produces: `npm run test:security` actually runs; pre-submit human checklist

- [ ] **Step 1: Fix Jest testMatch**

In `jest.config.js` set:

```js
testMatch: [
  '**/__tests__/**/*.[jt]s?(x)',
  '**/?(*.)+(spec|test).[jt]s?(x)',
  '<rootDir>/src/tests/**/*.test.ts',
],
```

- [ ] **Step 2: Run security tests**

Run: `npm run test:security`  
Expected: Jest runs `src/tests/security.test.ts` and passes (or report real failures to fix — do not delete failing assertions without cause).

If failures are due to missing modules, fix imports minimally so the suite runs.

- [ ] **Step 3: Pre-submit checklist doc**

Create `store/PLAY_PRE_SUBMIT_CHECKLIST.md` with checkboxes mirroring Wave 0 testing gate:

- [ ] Privacy + Terms live on HTTPS  
- [ ] About links work in app  
- [ ] Splash OK; no ring decorations  
- [ ] Release AAB; R8 on; cleartext off  
- [ ] No keystores in git  
- [ ] Smoke: onboarding, TOTP offline, backup, biometric, lock on background, About  
- [ ] Data Safety matches PLAY_DATA_SAFETY.md  
- [ ] Screenshots + feature graphic uploaded  

- [ ] **Step 4: Commit**

```bash
git add jest.config.js store/PLAY_PRE_SUBMIT_CHECKLIST.md
git commit -m "test: fix Jest discovery and add Play pre-submit checklist"
```

---

### Task 6: Spec status + internal verify (no install)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-android-play-wave0-design.md` (status line only)
- Modify: `docs/superpowers/specs/2026-07-19-android-mvp-design.md` — one-line note that Play is Wave 0

- [ ] **Step 1: Mark Wave 0 spec status**

Change status to: `Approved — implementation plan ready / in progress`

Add under MVP out-of-scope note in android-mvp design: “Google Play distribution: see Wave 0 spec 2026-07-22.”

- [ ] **Step 2: Internal verify (no adb)**

Run:

```bash
npm run build
npx tsc --noEmit
npm run test:security
cd src-tauri && cargo test --lib --locked
```

Expected: all exit 0.

- [ ] **Step 3: Commit docs**

```bash
git add docs/superpowers/specs/2026-07-22-android-play-wave0-design.md docs/superpowers/specs/2026-07-19-android-mvp-design.md
git commit -m "docs: link MVP design to Play Wave 0"
```

---

## Spec coverage (self-review)

| Spec workstream | Task |
|-----------------|------|
| A Legal & in-app | 1, 2 |
| B Splash / copy / UX | 3 |
| C Build/signing docs | 4 (signing guide); AAB build remains operator step on machine with SDK |
| D Security posture | Constraints + checklist; no code change to crypto |
| E Play Console assets | 4 listing + data safety; binary screenshots operator |
| F Testing gate | 5 checklist + 6 internal verify; device smoke still requires later install (out of this plan’s “no install” verify) |

**Explicitly not in plan:** uploading to Play Console, creating keystore binaries, photographing screenshots, W1–W4 features.

## Plan complete

Saved to `docs/superpowers/plans/2026-07-22-android-play-wave0.md`.
