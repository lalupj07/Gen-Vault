/** Fired after vault unlock / login so UI prefs can reload from vault + localStorage. */
export const PREFS_SYNC_EVENT = 'genvault:prefs-sync';

export function requestPrefsSync() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PREFS_SYNC_EVENT));
}
