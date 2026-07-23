const KEY = 'genvault_last_backup_at';
const REMIND_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function markBackupDone(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch { /* private mode */ }
}

export function getLastBackupAt(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function backupReminderDue(): boolean {
  const last = getLastBackupAt();
  if (last == null) return true;
  return Date.now() - last >= REMIND_AFTER_MS;
}

export function backupReminderLabel(): string {
  const last = getLastBackupAt();
  if (last == null) return 'No encrypted backup recorded on this device yet.';
  const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Backup recorded today.';
  if (days === 1) return 'Last backup: yesterday.';
  return `Last backup: ${days} days ago.`;
}
