'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Download, Upload, Info, Sun, Moon, Monitor, Trash2 } from 'lucide-react';
import { api, type AppSettings } from '@/lib/api';
import { PRODUCT } from '@/lib/company';
import { cn } from '@/lib/utils';
import { useTheme, type Theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useFont, type UiFont } from '@/lib/font';
import { useAuth } from '@/lib/auth';
import { markBackupDone, backupReminderLabel, backupReminderDue } from '@/lib/backup-reminder';
import MobileTimeSync from './MobileTimeSync';
import AccountRecoveryScreen from '@/components/AccountRecoveryScreen';
import { isDemoMode } from '@/lib/demo/flag';

interface Props {
  onRefresh: () => void;
  onOpenAbout?: () => void;
}

export default function MobileSettings({ onRefresh, onOpenAbout }: Props) {
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale, locales } = useI18n();
  const { font, setFont, fonts } = useFont();
  const { refreshUnlockMethods, user, resetToSetup } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [helloOk, setHelloOk] = useState(false);
  const [hasHello, setHasHello] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

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
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, []);

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
    const next = { ...settings, lock_timeout_mins: mins, auto_lock: mins > 0 };
    setSettings(next);
    try {
      await api.updateSettings(next);
      setMsg('Auto-lock updated');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    }
  };

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
            {[1, 5, 15, 30].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => saveTimeout(m)}
                className={cn(
                  'm3-chip',
                )}
                data-active={settings?.lock_timeout_mins === m ? 'true' : 'false'}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
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
            disabled={busy}
            onClick={exportBackup}
            className="flex-1 min-h-[44px] rounded-[var(--m3-radius-lg)] bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)] font-medium flex items-center justify-center gap-2 hover:brightness-110 transition-[filter] duration-200"
          >
            <Download className="w-4 h-4" /> {t('common.export')}
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
          account. {isDemoMode()
            ? 'GenXis cannot restore lost demo credentials.'
            : 'GenXis cannot restore a zero-knowledge vault.'}
        </p>
        {isDemoMode() && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Reset demo data? This clears this browser\u2019s demo vault.')) return;
              setBusy(true);
              try {
                await api.eraseVaultAndReset('DELETE MY VAULT');
                window.location.reload();
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Reset failed');
                setBusy(false);
              }
            }}
            className="w-full min-h-[48px] rounded-[var(--m3-radius-lg)] border border-accent-danger/40 px-4 text-sm font-medium text-accent-danger hover:bg-accent-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-danger flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
            Reset demo
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowRecovery(true)}
          className="w-full min-h-[48px] rounded-[var(--m3-radius-lg)] border border-accent-danger/40 px-4 text-sm font-medium text-accent-danger hover:bg-accent-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-danger flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" aria-hidden />
          Erase vault and start fresh
        </button>
      </section>

      <section className="m3-glass p-4 flex gap-3">
        <Info className="w-5 h-5 text-[color:var(--md-on-surface-variant)] flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="m3-title-md">{PRODUCT.name}</p>
          <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-1">
            {isDemoMode()
              ? 'Browser demo · local storage only'
              : 'Offline authentication vault · AES-256-GCM · Argon2id'}
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
