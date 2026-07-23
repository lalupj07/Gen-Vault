/** Offline-friendly clock sanity checks for TOTP (no network). */

export type TimeSyncResult = {
  ok: boolean;
  utcIso: string;
  localLabel: string;
  timezone: string;
  warnings: string[];
};

export function checkDeviceTime(): TimeSyncResult {
  const now = new Date();
  const warnings: string[] = [];

  // Extreme year → almost certainly wrong clock
  const year = now.getUTCFullYear();
  if (year < 2020 || year > 2100) {
    warnings.push('Device year looks wrong. TOTP codes will not match services.');
  }

  // Prefer automatic time (we can only advise)
  warnings.push('Enable automatic date & time in system settings for reliable codes.');

  return {
    ok: warnings.length <= 1 && year >= 2020 && year <= 2100,
    utcIso: now.toISOString(),
    localLabel: now.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
    warnings,
  };
}

/** Fire a short vibration when a TOTP window expires (Android / supported browsers). */
export function vibrateOnOtpExpiry(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([40, 30, 40]);
    }
  } catch { /* ignore */ }
}
