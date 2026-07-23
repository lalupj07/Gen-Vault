/** Secure clipboard: copy then auto-clear after timeout (default 30s). */
const DEFAULT_CLEAR_MS = 30_000;
let clearTimer: number | undefined;
let lastCopied: string | null = null;

export async function copySecure(
  text: string,
  clearAfterMs: number = DEFAULT_CLEAR_MS,
): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard unavailable');
  }
  await navigator.clipboard.writeText(text);
  lastCopied = text;
  if (clearTimer !== undefined) window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => {
    void clearSecureClipboard();
  }, clearAfterMs);
}

/** Clear clipboard only if it still holds our last secret (best-effort). */
export async function clearSecureClipboard(): Promise<void> {
  if (clearTimer !== undefined) {
    window.clearTimeout(clearTimer);
    clearTimer = undefined;
  }
  const expected = lastCopied;
  lastCopied = null;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
  try {
    if (expected && navigator.clipboard.readText) {
      const current = await navigator.clipboard.readText();
      if (current !== expected) return;
    }
    await navigator.clipboard.writeText('');
  } catch {
    try {
      await navigator.clipboard.writeText('');
    } catch { /* ignore */ }
  }
}

export function clipboardClearSeconds(clearAfterMs: number = DEFAULT_CLEAR_MS): number {
  return Math.round(clearAfterMs / 1000);
}
