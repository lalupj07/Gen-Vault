export type ShortcutAction =
  | 'add-entry'
  | 'search-vault'
  | 'import'
  | 'export'
  | 'lock-vault'
  | 'settings'
  | 'templates'
  | 'favorites'
  | 'security-audit'
  | 'emergency-codes'
  | 'command-palette';

const EVENT = 'genvault:shortcut';

export function dispatchShortcut(action: ShortcutAction) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: action }));
}

export function onShortcut(handler: (action: ShortcutAction) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<ShortcutAction>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export const PALETTE_ACTION_MAP: Record<string, ShortcutAction> = {
  add_entry: 'add-entry',
  search: 'search-vault',
  import: 'import',
  export: 'export',
  lock_vault: 'lock-vault',
  settings: 'settings',
  templates: 'templates',
  favorites: 'favorites',
  security_audit: 'security-audit',
  emergency_codes: 'emergency-codes',
};
