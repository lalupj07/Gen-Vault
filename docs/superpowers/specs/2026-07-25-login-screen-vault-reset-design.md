# Login-Screen Vault Reset Design

Date: 2026-07-25  
Status: Approved for implementation planning

## Problem

GenVault is an offline, zero-knowledge vault. If a user loses both the master
password and all recovery codes, the existing encrypted vault cannot be
recovered. The current login screen offers password recovery, but a completed
account cannot be erased from that screen. This can leave the user unable to
use the app again on the device.

The app needs an explicit escape hatch that permanently erases the inaccessible
local vault and returns the user to first-run account creation. It must not imply
that old data can be recovered.

## Goals

- Make the reset path available from the locked login screen.
- Preserve recovery as the preferred, non-destructive option.
- Let a user with no usable recovery method erase the inaccessible vault and
  create a new account.
- Require deliberate confirmation by typing `DELETE MY VAULT`.
- Wipe all local vault data, recovery material, attachments, database content,
  session state, rate-limit state, and OS-backed protector entries.
- Return to the existing Create Your Vault flow after a successful reset.
- Use existing GenVault product tokens and adaptive mobile/desktop patterns.

## Non-goals

- Recovering data without the master password or a recovery code.
- Adding cloud recovery, support-assisted recovery, or a cryptographic backdoor.
- Changing the normal signed-in account deletion flow.
- Replacing the existing recovery-code password reset.
- Creating multiple local accounts.

## Considered Approaches

### 1. Add a direct “Start over” button to the login screen

This is the shortest flow, but it places a destructive action too close to
routine unlock controls and does not clearly prioritize recovery.

### 2. Add a “Can’t sign in?” recovery hub

This is the selected approach. A low-emphasis login-screen link opens a focused
screen with two explicit paths:

1. Recover with a recovery code and preserve data.
2. Erase the local vault and start fresh.

This keeps the login screen calm, makes the consequences understandable, and
separates recovery from irreversible destruction.

### 3. Automatically offer reset after repeated failed unlock attempts

This is rejected because it couples destructive account lifecycle UI to
authentication failures, encourages unnecessary resets, and could be used to
pressure a user into deleting recoverable data.

## User Experience

### Login screen entry point

Replace the isolated “Forgot password?” action with a low-emphasis
`Can’t sign in?` action below the primary unlock control. It must be reachable
by keyboard and meet the platform touch-target minimum:

- 44×44 pt on iOS-sized surfaces.
- 48×48 dp on Android-sized surfaces.

### Recovery hub

The recovery hub is a focused full-screen state within the existing auth
surface, not a small alert dialog. It contains:

- Title: `Can’t sign in?`
- Supporting copy: `Choose recovery to keep your vault, or erase this device’s
  vault and start over.`
- Primary safe action: `Use a recovery code`
- Secondary destructive-path action: `Erase vault and start fresh`
- Back action returning to login without changing data.

If no recovery codes are enrolled, the safe path remains visible but explains
that no codes are available. The destructive path remains available.

### Recovery-code path

The existing recovery-code password-reset flow remains unchanged in security
behavior. It preserves the vault, accepts one recovery code and a new master
password, and returns to login after success.

### Destructive reset screen

Selecting `Erase vault and start fresh` opens a dedicated confirmation state
with:

- Title: `Permanently erase this vault?`
- A concise warning that all local TOTP secrets, passwords, notes,
  attachments, settings, and recovery codes will be deleted.
- An explicit statement that zero-knowledge encryption means GenXis cannot
  restore the old vault.
- The instruction: `Type DELETE MY VAULT to continue.`
- A text field with autocomplete, autocorrect, and spellcheck disabled.
- A danger-styled `Erase vault` button.
- A safe `Go back` action.

The danger button stays disabled until the field value equals
`DELETE MY VAULT` exactly. Leading/trailing whitespace, different casing, and
partial text do not match.

While erasing, all controls are disabled and the button label changes to
`Erasing…`. A repeated click cannot start a second wipe.

### Success behavior

After the backend confirms the wipe:

1. Clear auth UI state and sensitive form values.
2. Reload/reinitialize account state.
3. Display the existing `Create Your Vault` flow.
4. Do not show language suggesting the old vault can still be restored.

## Visual Design

- Reuse the current GenVault dark surface, type, spacing, and form-control
  tokens.
- Use the purple primary accent only for the recovery action.
- Reserve the semantic danger color for the destructive path and final erase
  button.
- Do not use gradients, decorative glass effects, or animated warning
  decoration.
- Use one consistent icon family already present in the auth surface.
- Keep warning prose within 65–75 characters per line on wide layouts.
- Respect `prefers-reduced-motion`; transitions may crossfade but must never
  delay access to controls.
- Provide visible focus, WCAG AA text contrast, error text associated with its
  field, and an accessible live status while erasing.

## Backend Design

### New command

Add a dedicated unauthenticated command:

`erase_vault_and_reset(confirmation: String) -> Result<(), String>`

The backend must compare the received string to the exact literal
`DELETE MY VAULT`. A mismatch fails closed without changing data.

The command is intentionally separate from:

- `reset_local_account`, which remains restricted to incomplete-account
  cleanup.
- `delete_account_cmd`, which remains the authenticated signed-in deletion
  path.

### Wipe sequence

After confirmation succeeds, execute a single guarded reset operation:

1. Prevent concurrent reset execution with an in-process mutex or atomic guard.
2. Clear and zeroize any in-memory VMK session.
3. Call the existing comprehensive account deletion path to remove:
   - Encrypted vault metadata.
   - SQLite vault data.
   - Attachments.
   - Recovery-code data.
   - Legacy recovery data.
   - OS keyring VMK/protector entries.
   - Android Keystore Hello protector data.
4. Reset the local rate-limit state.
5. Return success only when required local account data has been removed.

Deletion must be idempotent: retrying after an interrupted partial wipe
continues cleanup instead of failing because some files are already absent or
recreating an account.

### Security boundary

The confirmation phrase prevents accidental user action; it is not
authentication. Anyone able to control the app UI on an unlocked device may
destroy local encrypted data, but this path never decrypts or exposes it.
Confidentiality is unchanged. The UI must describe this as permanent local
destruction, not password bypass.

The command accepts no paths, usernames, filenames, or account identifiers.
It must not return vault metadata or distinguish which individual files existed.

## Frontend Integration

- Add the new command wrapper to the existing Tauri API module.
- Model auth recovery as explicit states rather than stacking multiple modals:
  `login`, `recovery-options`, `recovery-code`, and `erase-confirmation`.
- Keep destructive-confirmation text in component state only and clear it on
  back, success, unmount, and error retry.
- Reuse the existing `PasswordReset` logic for the recovery-code branch, while
  adapting its presentation to the recovery hub where practical.
- Route backend errors through the existing safe invoke-error formatter.

## Error Handling

- Wrong confirmation phrase: keep the button disabled in the UI; if invoked
  directly, return a generic confirmation-mismatch error.
- Wipe failure: remain on the confirmation screen, clear the typed phrase, and
  show `The vault could not be fully erased. Try again.` Do not claim success.
- Partial deletion: the backend retry path must continue cleanup safely.
- Reload failure after successful wipe: show a `Return to setup` action that
  reinitializes auth state without attempting to restore deleted data.
- Recovery-code availability check failure: show both paths and label recovery
  status as unavailable rather than hiding the start-over option.

## Testing

### Rust tests

- Reject empty, partial, case-mismatched, and whitespace-padded confirmation.
- Accept only the exact phrase.
- Confirm a completed account can be erased through the new command.
- Confirm vault files, database, attachments, recovery codes, keyring/keystore
  protectors, session VMK, and rate-limit state are removed/reset.
- Confirm the command is safe to retry after complete and partial deletion.
- Confirm `reset_local_account` still rejects completed-account deletion.
- Confirm `delete_account_cmd` still requires password authentication.

### Frontend tests

- `Can’t sign in?` is present on the login screen.
- Both recovery and erase paths are visible in the recovery hub.
- The erase button is disabled until the exact phrase is entered.
- Back navigation clears the phrase and changes no account data.
- Loading prevents duplicate submissions.
- Success returns to Create Your Vault.
- Failure stays on the confirmation screen with safe error copy.
- Keyboard focus order, accessible names, live status, reduced motion, and
  compact/expanded layouts meet the stated platform requirements.

### Manual acceptance

1. Create a vault and add representative secrets, notes, and an attachment.
2. Lock the app and open `Can’t sign in?`.
3. Verify recovery remains the first, safe path.
4. Verify near-matching phrases cannot enable deletion.
5. Enter the exact phrase and erase.
6. Verify the app opens account creation.
7. Verify old credentials, recovery codes, and protected local files cannot
   unlock or restore the erased vault.
8. Create a new account and verify normal vault operation.

## Acceptance Criteria

- A locked-out user can start over from the login screen without a password or
  recovery code.
- The user must type `DELETE MY VAULT` exactly before deletion is possible.
- The UI clearly distinguishes data-preserving recovery from permanent reset.
- No old vault secret is decrypted, exported, or retained by the reset flow.
- Successful deletion returns directly to new-account creation.
- Existing recovery and authenticated account deletion remain intact.
- Automated tests cover confirmation validation, complete wipe, retry safety,
  and login-screen behavior.
