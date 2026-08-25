/** Masked master-password prompt (never use window.prompt for secrets). */

type Resolver = (value: string | null) => void;

let pending: Resolver | null = null;
let listeners = new Set<(open: boolean, message: string) => void>();

export function subscribeMasterPasswordPrompt(
  fn: (open: boolean, message: string) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(open: boolean, message: string) {
  listeners.forEach((fn) => fn(open, message));
}

/** Returns password string, or null if cancelled / empty. */
export function promptMasterPassword(message: string): Promise<string | null> {
  if (pending) {
    pending(null);
    pending = null;
  }
  return new Promise((resolve) => {
    pending = resolve;
    notify(true, message);
  });
}

export function resolveMasterPasswordPrompt(value: string | null) {
  const r = pending;
  pending = null;
  notify(false, '');
  r?.(value && value.length > 0 ? value : null);
}
