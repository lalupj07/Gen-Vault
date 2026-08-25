'use client';

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Download, Upload, Info, Sun, Moon, Monitor, Trash2, Plane, ShieldAlert, UserCheck } from 'lucide-react';
import { api, type AppSettings, type GuestGrantPublic, type GuestKind, type LockedFolder, type MediaItem } from '@/lib/api';
import { PRODUCT } from '@/lib/company';
import { cn } from '@/lib/utils';
import { useTheme, type Theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFont, type UiFont } from '@/lib/font';
import { useAuth } from '@/lib/auth';
import { promptMasterPassword } from '@/lib/prompt-master-password';
import { markBackupDone, backupReminderLabel, backupReminderDue } from '@/lib/backup-reminder';
import MobileTimeSync from './MobileTimeSync';
import AccountRecoveryScreen from '@/components/AccountRecoveryScreen';

interface Props {
  onRefresh: () => void;
  onOpenAbout?: () => void;
}

export default function MobileSettings({ onRefresh, onOpenAbout }: Props) {
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale, locales } = useI18n();
  const { font, setFont, fonts } = useFont();
  const { refreshUnlockMethods, user, resetToSetup, travelMode, refreshTravelMode, vaultLocked } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [helloOk, setHelloOk] = useState(false);
  const [hasHello, setHasHello] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const [travelLoading, setTravelLoading] = useState(false);
  const [travelError, setTravelError] = useState('');

  const [duressEnrolled, setDuressEnrolled] = useState(false);
  const [duressLoading, setDuressLoading] = useState(false);
  const [duressError, setDuressError] = useState('');
  const [duressMessage, setDuressMessage] = useState('');
  const [showDuressEnroll, setShowDuressEnroll] = useState(false);
  const [duressPassword, setDuressPassword] = useState('');
  const [duressConfirm, setDuressConfirm] = useState('');

  const [guestGrants, setGuestGrants] = useState<GuestGrantPublic[]>([]);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [showGuestCreate, setShowGuestCreate] = useState(false);
  const [guestKind, setGuestKind] = useState<GuestKind>('file');
  const [guestItemId, setGuestItemId] = useState('');
  const [guestLabel, setGuestLabel] = useState('');
  const [guestPassphrase, setGuestPassphrase] = useState('');
  const [guestTtlMins, setGuestTtlMins] = useState(15);
  const [guestItems, setGuestItems] = useState<{ id: string; label: string }[]>([]);

  const load = async () => {
    try {
      const [s, avail, info] = await Promise.all([
        api.getSettings(),
        api.helloAvailable().catch(() => false),
        api.getUnlockInfo().catch(() => ({ exists: false, legacy: false, methods: [] as string[] })),
      ]);
      setSettings(s);
      setHelloOk(avail);
      setHasHello(info.methods.includes('hello'));
      setDuressEnrolled(await api.hasDuressEnrolled().catch(() => false));
    } catch {
      /* ignore */
    }
  };

  const refreshGuestGrants = useCallback(async () => {
    if (vaultLocked) return;
    setGuestLoading(true);
    setGuestError('');
    try {
      setGuestGrants(await api.guestGrantList());
    } catch (e) {
      setGuestError(e instanceof Error ? e.message : 'Failed to load guest grants');
    }
    setGuestLoading(false);
  }, [vaultLocked]);

  const loadGuestItems = useCallback(async (kind: GuestKind) => {
    try {
      if (kind === 'folder') {
        const rows = await api.folderLockList();
        setGuestItems(rows.map((r: LockedFolder) => ({ id: r.id, label: r.display_name })));
      } else if (kind === 'file') {
        const rows = await api.fileLockList();
        setGuestItems(rows.map((r) => ({ id: r.id, label: r.display_name })));
      } else {
        const rows = await api.mediaVaultList();
        setGuestItems(rows.map((r: MediaItem) => ({ id: r.id, label: r.title || r.original_name })));
      }
    } catch {
      setGuestItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!vaultLocked) void refreshGuestGrants();
  }, [vaultLocked, refreshGuestGrants]);

  useEffect(() => {
    if (showGuestCreate && !vaultLocked) void loadGuestItems(guestKind);
  }, [showGuestCreate, guestKind, vaultLocked, loadGuestItems]);

  if (showRecovery) {
    return (
      <AccountRecoveryScreen
        username={user?.username || ''}
        onBack={() => setShowRecovery(false)}
        onResetComplete={() => {
          setShowRecovery(false);
          setPassphrase('');
          setMsg('');
          setErr('');
          resetToSetup();
        }}
      />
    );
  }

  const saveTimeout = async (mins: number) => {
    if (!settings) return;
    const capped = travelMode ? Math.min(mins, 2) : mins;
    const next = { ...settings, lock_timeout_mins: capped, auto_lock: capped > 0 };
    setSettings(next);
    try {
      await api.updateSettings(next);
      setMsg('Auto-lock updated');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleTravelMode = async (enabled: boolean) => {
    setTravelError('');
    setTravelLoading(true);
    try {
      if (enabled) {
        await api.setTravelMode(true);
        if (settings && settings.lock_timeout_mins > 2) {
          await saveTimeout(2);
        }
      } else {
        const password = await promptMasterPassword('Enter master password to disable travel mode:');
        if (!password) {
          setTravelLoading(false);
          return;
        }
        await api.setTravelMode(false, password);
      }
      await refreshTravelMode();
      setMsg(enabled ? 'Travel mode enabled' : 'Travel mode disabled');
    } catch (e) {
      setTravelError(e instanceof Error ? e.message : 'Travel mode update failed');
    }
    setTravelLoading(false);
  };

  const handleDuressEnroll = async () => {
    if (duressPassword.length < 12) {
      setDuressError('Duress password must be at least 12 characters');
      return;
    }
    if (duressPassword !== duressConfirm) {
      setDuressError('Passwords do not match');
      return;
    }
    setDuressError('');
    setDuressMessage('');
    const masterPassword = await promptMasterPassword('Enter master password to enroll duress password:');
    if (!masterPassword) return;
    if (masterPassword === duressPassword) {
      setDuressError('Duress password must differ from master password');
      return;
    }
    setDuressLoading(true);
    try {
      await api.enrollDuressPassword(masterPassword, duressPassword);
      setDuressMessage('Duress password enrolled');
      setShowDuressEnroll(false);
      setDuressPassword('');
      setDuressConfirm('');
      setDuressEnrolled(true);
    } catch (e) {
      setDuressError(e instanceof Error ? e.message : 'Failed to enroll duress password');
    }
    setDuressLoading(false);
  };

  const handleDuressRemove = async () => {
    setDuressError('');
    setDuressMessage('');
    const masterPassword = await promptMasterPassword('Enter master password to remove duress password:');
    if (!masterPassword) return;
    setDuressLoading(true);
    try {
      await api.removeDuressPassword(masterPassword);
      setDuressMessage('Duress password removed');
      setShowDuressEnroll(false);
      setDuressPassword('');
      setDuressConfirm('');
      setDuressEnrolled(false);
    } catch (e) {
      setDuressError(e instanceof Error ? e.message : 'Failed to remove duress password');
    }
    setDuressLoading(false);
  };

  const handleGuestRevoke = async (id: string) => {
    setGuestError('');
    setGuestMessage('');
    setGuestLoading(true);
    try {
      await api.guestGrantRevoke(id);
      setGuestMessage('Grant revoked');
      await refreshGuestGrants();
    } catch (e) {
      setGuestError(e instanceof Error ? e.message : 'Revoke failed');
    }
    setGuestLoading(false);
  };

  const handleGuestCreate = async () => {
    if (!guestItemId) {
      setGuestError('Enter an item ID');
      return;
    }
    if (!guestLabel.trim()) {
      setGuestError('Enter a label for this grant');
      return;
    }
    if (guestPassphrase.length < 12) {
      setGuestError('Passphrase must be at least 12 characters');
      return;
    }
    setGuestError('');
    setGuestMessage('');
    setGuestLoading(true);
    try {
      const grant = await api.guestGrantCreate(
        guestKind,
        guestItemId,
        guestLabel.trim(),
        guestPassphrase,
        guestTtlMins,
      );
      setGuestMessage(`Grant created — share ID: ${grant.id}`);
      setShowGuestCreate(false);
      setGuestItemId('');
      setGuestLabel('');
      setGuestPassphrase('');
      setGuestTtlMins(15);
      await refreshGuestGrants();
    } catch (e) {
      setGuestError(e instanceof Error ? e.message : 'Create grant failed');
    }
    setGuestLoading(false);
  };

  const formatGuestExpiry = (expiresAt: number) => {
    const ms = expiresAt * 1000 - Date.now();
    if (ms <= 0) return 'Expired';
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `${mins} min remaining`;
    return `${Math.ceil(mins / 60)} hr remaining`;
  };

  const effectiveLockMins = travelMode
    ? Math.min(settings?.lock_timeout_mins ?? 5, 2)
    : (settings?.lock_timeout_mins ?? 5);

  const toggleBiometric = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      if (hasHello) {
        await api.removeUnlockMethod('hello');
        setHasHello(false);
        setMsg('Biometric unlock disabled');
      } else {
        if (!helloOk) {
          setErr('Set a screen lock (PIN/pattern) or fingerprint, then try again');
          setBusy(false);
          return;
        }
        setMsg('Confirm fingerprint, face, or device PIN…');
        const enroll = api.enrollHello();
        const timeout = new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error('Timed out — cancel the system prompt and try again')),
            35_000,
          );
        });
        await Promise.race([enroll, timeout]);
        setHasHello(true);
        setMsg('Biometric enabled — unlock still requires your master password, then fingerprint / face');
      }
      await api.setBiometricSettings(!hasHello);
      await refreshUnlockMethods();
    } catch (e) {
      setMsg('');
      setErr(e instanceof Error ? e.message : 'Biometric update failed');
      await load();
    }
    setBusy(false);
  };

  const exportBackup = async () => {
    setErr('');
    setMsg('');
    if (passphrase.length < 12) {
      setErr('Backup passphrase must be at least 12 characters');
      return;
    }
    setBusy(true);
    try {
      const json = await api.exportBackup(passphrase);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'genvault-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      markBackupDone();
      setPassphrase('');
      setMsg('Backup ready — save the file securely');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export failed');
    }
    setBusy(false);
  };

  const restoreBackup = async () => {
    setErr('');
    setMsg('');
    if (passphrase.length < 12) {
      setErr('Enter the backup passphrase');
      return;
    }
    if (!window.confirm('Restore replaces all vault entries on this device. Continue?')) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const json = await file.text();
        await api.restoreBackup(passphrase, json);
        setMsg('Vault restored');
        onRefresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Restore failed — vault unchanged');
      }
      setBusy(false);
    };
    input.click();
  };

  return (
    <div className="space-y-5 pt-2 pb-4">
      <h2 className="m3-title-lg">{t('mobile.settings.title')}</h2>

      <section className="m3-glass p-4">
        <p className="m3-title-md mb-3">{t('settings.appearance')}</p>
        <div className="flex gap-2">
          {([
            { id: 'dark' as Theme, label: t('mobile.settings.theme.dark'), icon: Moon },
            { id: 'light' as Theme, label: t('mobile.settings.theme.light'), icon: Sun },
            { id: 'pitch-black' as Theme, label: t('mobile.settings.theme.amoled'), icon: Monitor },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              className={cn(
                'flex-1 min-h-[48px] rounded-[var(--m3-radius-md)] flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-200',
                theme === id
                  ? 'm3-fab !w-auto !h-auto !rounded-[var(--m3-radius-md)]'
                  : 'bg-[color:var(--md-surface-container)] text-[color:var(--md-on-surface-variant)]'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="m3-glass p-4 space-y-3">
        <div>
          <p className="m3-title-md">{t('settings.language')}</p>
          <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-0.5 mb-2">{t('settings.language.desc')}</p>
          <select
            value={locale}
            onChange={(e) => void setLocale(e.target.value as typeof locale)}
            className="m3-field text-sm"
          >
            {locales.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="m3-title-md">{t('settings.font')}</p>
          <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-0.5 mb-2">{t('settings.font.desc')}</p>
          <div className="flex flex-wrap gap-2">
            {fonts.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => void setFont(f.id as UiFont)}
                className="m3-chip"
                data-active={font === f.id ? 'true' : 'false'}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="m3-glass divide-y divide-[color:var(--md-outline-variant)] overflow-hidden p-0">
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-[var(--m3-radius-md)] bg-[color:var(--md-primary-container)] flex items-center justify-center flex-shrink-0">
              <Fingerprint className="w-5 h-5 text-[color:var(--md-on-primary-container)]" />
            </span>
            <div>
              <p className="m3-title-md">{t('mobile.settings.biometric')}</p>
              <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-0.5">
                {t('mobile.settings.biometric.desc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hasHello}
            disabled={busy || (!hasHello && !helloOk)}
            onClick={toggleBiometric}
            className={cn(
              'relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-40',
              hasHello ? 'bg-[color:var(--md-primary)]' : 'bg-[color:var(--md-outline)]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform duration-200',
                hasHello && 'translate-x-5'
              )}
            />
          </button>
        </div>

        <div className="p-4">
          <p className="m3-title-md mb-2">{t('mobile.settings.autolock')}</p>
          <div className="flex flex-wrap gap-2">
            {(travelMode ? [1, 2] : [1, 5, 15, 30]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => saveTimeout(m)}
                className={cn(
                  'm3-chip',
                )}
                data-active={effectiveLockMins === m ? 'true' : 'false'}
              >
                {m} min
              </button>
            ))}
          </div>
          {travelMode && (
            <p className="text-[11px] text-[color:var(--md-on-surface-variant)] mt-2">
              Travel mode caps auto-lock at 2 minutes.
            </p>
          )}
        </div>
      </section>

      <section className="m3-glass p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-[var(--m3-radius-md)] bg-[color:var(--md-primary-container)] flex items-center justify-center flex-shrink-0">
            <Plane className="w-5 h-5 text-[color:var(--md-on-primary-container)]" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="m3-title-md">Travel mode</p>
                <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-0.5">
                  Temporary lockdown for travel. Disable requires master password.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={travelMode}
                disabled={travelLoading || vaultLocked}
                onClick={() => void handleTravelMode(!travelMode)}
                className={cn(
                  'relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-40',
                  travelMode ? 'bg-[color:var(--md-primary)]' : 'bg-[color:var(--md-outline)]'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform duration-200',
                    travelMode && 'translate-x-5'
                  )}
                />
              </button>
            </div>
            <p className="text-[11px] text-[color:var(--md-on-surface-variant)] mt-2">
              Screen capture already blocked on Android (FLAG_SECURE).
            </p>
            {travelError && (
              <p className="text-xs text-accent-danger mt-2">{travelError}</p>
            )}
          </div>
        </div>
      </section>

      <section className="m3-glass p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-[var(--m3-radius-md)] bg-[color:var(--md-primary-container)] flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5 text-[color:var(--md-on-primary-container)]" />
            </span>
            <div>
              <p className="m3-title-md">Duress password</p>
              <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-0.5">
                {duressEnrolled ? 'Enrolled — decoy vault active' : 'Not enrolled'}
              </p>
            </div>
          </div>
          {!vaultLocked && !duressEnrolled && (
            <button
              type="button"
              onClick={() => { setShowDuressEnroll((v) => !v); setDuressError(''); setDuressMessage(''); }}
              disabled={duressLoading}
              className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)] disabled:opacity-50"
            >
              {showDuressEnroll ? 'Cancel' : 'Set up'}
            </button>
          )}
        </div>
        <p className="text-xs text-[color:var(--md-on-surface-variant)]">
          A separate password unlocks a harmless decoy vault when you are compelled to reveal your password.
        </p>
        {vaultLocked ? (
          <p className="text-sm text-[color:var(--md-on-surface-variant)]">Unlock vault to manage duress password.</p>
        ) : (
          <>
            {duressEnrolled && (
              <button
                type="button"
                onClick={() => void handleDuressRemove()}
                disabled={duressLoading}
                className="w-full min-h-[44px] rounded-[var(--m3-radius-lg)] border border-accent-danger/40 text-sm font-medium text-accent-danger disabled:opacity-50"
              >
                {duressLoading ? 'Removing…' : 'Remove duress password'}
              </button>
            )}
            {showDuressEnroll && !duressEnrolled && (
              <div className="space-y-2">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="New duress password (12+ characters)"
                  value={duressPassword}
                  onChange={(e) => setDuressPassword(e.target.value)}
                  className="m3-field text-sm"
                />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Confirm duress password"
                  value={duressConfirm}
                  onChange={(e) => setDuressConfirm(e.target.value)}
                  className="m3-field text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handleDuressEnroll()}
                  disabled={duressLoading}
                  className="w-full min-h-[44px] rounded-[var(--m3-radius-lg)] m3-fab !w-full !h-auto text-sm font-semibold disabled:opacity-50"
                >
                  {duressLoading ? 'Enrolling…' : 'Enroll duress password'}
                </button>
              </div>
            )}
            {duressError && <p className="text-xs text-accent-danger">{duressError}</p>}
            {duressMessage && <p className="text-xs text-cyber-emerald">{duressMessage}</p>}
          </>
        )}
      </section>

      <section className="m3-glass p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="m3-title-md">Guest access grants</p>
          {!vaultLocked && (
            <button
              type="button"
              onClick={() => { setShowGuestCreate((v) => !v); setGuestError(''); setGuestMessage(''); }}
              disabled={guestLoading}
              className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)] disabled:opacity-50"
            >
              {showGuestCreate ? 'Cancel' : 'Create'}
            </button>
          )}
        </div>
        <p className="text-xs text-[color:var(--md-on-surface-variant)]">
          Time-limited passphrase access to locked folders, files, or media — guests unlock from the login screen.
        </p>
        {vaultLocked ? (
          <p className="text-sm text-[color:var(--md-on-surface-variant)]">Unlock vault to manage guest grants.</p>
        ) : (
          <>
            {showGuestCreate && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-[color:var(--md-on-surface-variant)]">
                    Kind
                    <select
                      value={guestKind}
                      onChange={(e) => { setGuestKind(e.target.value as GuestKind); setGuestItemId(''); }}
                      className="m3-field text-sm mt-1"
                    >
                      <option value="folder">Folder</option>
                      <option value="file">File</option>
                      <option value="media">Media</option>
                    </select>
                  </label>
                  <label className="text-xs text-[color:var(--md-on-surface-variant)]">
                    TTL (minutes)
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={guestTtlMins}
                      onChange={(e) => setGuestTtlMins(Math.min(60, Math.max(1, Number(e.target.value) || 15)))}
                      className="m3-field text-sm mt-1"
                    />
                  </label>
                </div>
                {guestItems.length > 0 ? (
                  <label className="text-xs text-[color:var(--md-on-surface-variant)] block">
                    Locked item
                    <select
                      value={guestItemId}
                      onChange={(e) => setGuestItemId(e.target.value)}
                      className="m3-field text-sm mt-1"
                    >
                      <option value="">Select item…</option>
                      {guestItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="text-xs text-[color:var(--md-on-surface-variant)] block">
                    Item ID
                    <input
                      type="text"
                      value={guestItemId}
                      onChange={(e) => setGuestItemId(e.target.value)}
                      placeholder="Locked item UUID"
                      className="m3-field text-sm mt-1 font-mono"
                    />
                  </label>
                )}
                <input
                  type="text"
                  placeholder="Grant label"
                  value={guestLabel}
                  onChange={(e) => setGuestLabel(e.target.value)}
                  className="m3-field text-sm"
                />
                <input
                  type="password"
                  placeholder="Guest passphrase (min 12 chars)"
                  value={guestPassphrase}
                  onChange={(e) => setGuestPassphrase(e.target.value)}
                  autoComplete="new-password"
                  className="m3-field text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handleGuestCreate()}
                  disabled={guestLoading}
                  className="w-full min-h-[44px] rounded-[var(--m3-radius-lg)] m3-fab !w-full !h-auto text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  {guestLoading ? 'Creating…' : 'Create guest grant'}
                </button>
              </div>
            )}
            {guestGrants.length === 0 ? (
              <p className="text-sm text-[color:var(--md-on-surface-variant)]">No active guest grants</p>
            ) : (
              <div className="space-y-2">
                {guestGrants.map((g) => (
                  <div key={g.id} className="p-3 rounded-[var(--m3-radius-md)] bg-[color:var(--md-surface-container)] border border-[color:var(--md-outline-variant)]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{g.label}</p>
                        <p className="text-[10px] text-[color:var(--md-on-surface-variant)] mt-0.5">
                          {g.kind} · {formatGuestExpiry(g.expires_at)}
                        </p>
                        <p className="text-[10px] text-[color:var(--md-on-surface-variant)] font-mono truncate mt-1" title={g.id}>
                          ID: {g.id}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGuestRevoke(g.id)}
                        disabled={guestLoading}
                        className="text-xs px-2 py-1 rounded-lg text-accent-danger border border-accent-danger/30 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {guestError && <p className="text-xs text-accent-danger">{guestError}</p>}
            {guestMessage && <p className="text-xs text-cyber-emerald">{guestMessage}</p>}
          </>
        )}
      </section>

      <section className="m3-glass p-4 space-y-3">
        <p className="m3-title-md">{t('mobile.settings.backup')}</p>
        <p className={cn(
          'text-xs',
          backupReminderDue() ? 'text-accent-warning' : 'text-vault-muted',
        )}>
          {backupReminderLabel()}
        </p>
        <p className="text-xs text-vault-muted">
          Same <code className="text-cyber-cyan">genvault-backup</code> v1 format as Windows.
          Password-protected. For QR transfer use More → QR onboard.
        </p>
        <label className="block">
          <span className="sr-only">Backup passphrase</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Backup passphrase (12+ characters)"
            className="m3-field placeholder:text-[color:var(--md-on-surface-variant)]/70"
            autoComplete="new-password"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || travelMode}
            onClick={exportBackup}
            className="flex-1 min-h-[44px] rounded-[var(--m3-radius-lg)] bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition-[filter] duration-200 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> {travelMode ? 'Export blocked' : t('common.export')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={restoreBackup}
            className="flex-1 min-h-[44px] rounded-[var(--m3-radius-lg)] bg-[color:var(--md-surface-container)] text-[color:var(--md-on-surface)] font-medium flex items-center justify-center gap-2 border border-[color:var(--md-outline)] transition-colors duration-200"
          >
            <Upload className="w-4 h-4" /> {t('common.import')}
          </button>
        </div>
      </section>

      <section className="m3-glass p-4">
        <MobileTimeSync />
      </section>

      <section className="m3-glass p-4 space-y-3 border border-accent-danger/25">
        <p className="m3-title-md text-accent-danger">Can&rsquo;t sign in / start fresh</p>
        <p className="text-xs text-[color:var(--md-on-surface-variant)] leading-5">
          Lost master password and recovery codes? Erase this device&rsquo;s vault and create a new
          account. GenXis cannot restore a zero-knowledge vault.
        </p>
        <button
          type="button"
          disabled={travelMode}
          onClick={() => setShowRecovery(true)}
          className="w-full min-h-[48px] rounded-[var(--m3-radius-lg)] border border-accent-danger/40 px-4 text-sm font-medium text-accent-danger hover:bg-accent-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-danger flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" aria-hidden />
          {travelMode ? 'Erase blocked (travel mode)' : 'Erase vault and start fresh'}
        </button>
      </section>

      <section className="m3-glass p-4 flex gap-3">
        <Info className="w-5 h-5 text-[color:var(--md-on-surface-variant)] flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="m3-title-md">{PRODUCT.name}</p>
          <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-1">
            Offline authentication vault · AES-256-GCM · Argon2id
          </p>
          {onOpenAbout && (
            <button
              type="button"
              onClick={onOpenAbout}
              className="mt-3 min-h-[44px] w-full rounded-[var(--m3-radius-lg)] bg-[color:var(--md-surface-container)] border border-[color:var(--md-outline)] text-sm font-medium text-[color:var(--md-on-surface)]"
            >
              {t('mobile.settings.about')}
            </button>
          )}
        </div>
      </section>

      {(msg || err) && (
        <p className={cn('text-sm', err ? 'text-cyber-red' : 'text-cyber-emerald')} role="status">
          {err || msg}
        </p>
      )}
    </div>
  );
}
