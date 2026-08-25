'use client';

import { useEffect, useState } from 'react';
import {
  User, Shield, Fingerprint, KeyRound, Calendar, Clock,
  Award, Edit3, CheckCircle2, Lock, Vault, LogOut, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { GlassSurface, M3IconWell } from './m3';

interface Props {
  entryCount?: number;
  totpCount?: number;
  securityScore?: number;
}

export default function MobileProfile({
  entryCount = 0,
  totpCount = 0,
  securityScore = 0,
}: Props) {
  const { user, updateUser, logOut, lockVault, panicLock } = useAuth();
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.displayName || '');
  const [hasHello, setHasHello] = useState(false);
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    api.getUnlockInfo()
      .then((info) => {
        setMethods(info.methods);
        setHasHello(info.methods.includes('hello'));
      })
      .catch(() => {});
  }, []);

  if (!user) return null;

  const initials = user.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const lastLogin = new Date(user.lastLogin).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const ageDays = Math.max(0, Math.floor((Date.now() - user.createdAt) / 86400000));
  const tier = (user.securityTier || 'standard').replace(/^\w/, (c) => c.toUpperCase());

  const saveName = () => {
    const next = editName.trim();
    if (next && next !== user.displayName) {
      updateUser({ displayName: next });
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-4 pt-2 pb-6">
      <div>
        <h2 className="m3-title-lg">{t('mobile.profile.title')}</h2>
        <p className="text-xs text-[color:var(--md-on-surface-variant)] mt-0.5">
          {t('mobile.profile.subtitle')}
        </p>
      </div>

      <GlassSurface className="overflow-hidden p-0">
        <div
          className="h-20 px-4 pt-4"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--md-primary) 22%, transparent), color-mix(in srgb, var(--md-primary-container) 40%, transparent))',
          }}
        >
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[color:var(--md-surface-glass)] border border-[color:var(--md-outline)] text-[color:var(--md-on-surface)]">
            <Award className="w-3 h-3 text-[color:var(--md-primary)]" />
            {tier} tier
          </span>
        </div>
        <div className="px-4 pb-4 -mt-8">
          <div className="flex items-end gap-3">
            <div className="w-16 h-16 rounded-[var(--m3-radius-lg)] bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)] border-2 border-[color:var(--md-surface)] flex items-center justify-center text-xl font-bold shadow-[var(--glass-shadow)]">
              {initials}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              {isEditing ? (
                <div className="flex gap-2 items-center">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    className="m3-field !min-h-[40px] text-sm flex-1"
                    autoFocus
                  />
                  <button type="button" onClick={saveName} className="text-xs font-semibold text-[color:var(--md-primary)] min-h-[40px] px-2">
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="m3-title-md truncate">{user.displayName}</p>
                  <button
                    type="button"
                    onClick={() => { setEditName(user.displayName); setIsEditing(true); }}
                    className="p-2 rounded-full text-[color:var(--md-on-surface-variant)]"
                    aria-label="Edit display name"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-[color:var(--md-on-surface-variant)] flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3" /> @{user.username}
              </p>
            </div>
          </div>
        </div>
      </GlassSurface>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t('mobile.profile.entries'), value: String(entryCount), icon: Vault },
          { label: t('mobile.profile.codes'), value: String(totpCount), icon: KeyRound },
          { label: t('mobile.profile.score'), value: `${securityScore}%`, icon: Shield },
        ].map(({ label, value, icon: Icon }) => (
          <GlassSurface key={label} className="p-3 text-center">
            <Icon className="w-4 h-4 mx-auto text-[color:var(--md-primary)] mb-1" />
            <p className="text-lg font-semibold text-[color:var(--md-on-surface)] leading-none">{value}</p>
            <p className="text-[10px] text-[color:var(--md-on-surface-variant)] mt-1">{label}</p>
          </GlassSurface>
        ))}
      </div>

      <GlassSurface className="p-0 divide-y divide-[color:var(--md-outline-variant)] overflow-hidden">
        <DetailRow icon={Calendar} label={t('mobile.profile.member')} value={memberSince} hint={`${ageDays}d`} />
        <DetailRow icon={Clock} label={t('mobile.profile.last_unlock')} value={lastLogin} />
        <DetailRow
          icon={Fingerprint}
          label={t('mobile.profile.biometric')}
          value={hasHello ? t('mobile.profile.on') : t('mobile.profile.off')}
          accent={hasHello}
        />
        <DetailRow
          icon={Lock}
          label={t('mobile.profile.unlock_methods')}
          value={methods.length ? methods.map(prettyMethod).join(' · ') : '—'}
        />
        <DetailRow
          icon={CheckCircle2}
          label={t('mobile.profile.mfa')}
          value={user.mfaEnabled ? t('mobile.profile.on') : t('mobile.profile.off')}
          accent={user.mfaEnabled}
        />
      </GlassSurface>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void lockVault()}
          className="flex-1 min-h-[48px] rounded-[var(--m3-radius-lg)] border border-[color:var(--md-outline)] text-sm font-medium text-[color:var(--md-on-surface)]"
        >
          {t('common.lock')}
        </button>
        <button
          type="button"
          onClick={() => void panicLock()}
          className="flex-1 min-h-[48px] rounded-[var(--m3-radius-lg)] border border-accent-danger/40 text-sm font-medium text-accent-danger flex items-center justify-center gap-1.5"
        >
          <ShieldAlert className="w-4 h-4" />
          Panic lock
        </button>
      </div>
      <button
        type="button"
        onClick={() => logOut()}
        className="w-full min-h-[48px] rounded-[var(--m3-radius-lg)] bg-[color:var(--md-error)]/15 text-[color:var(--md-error)] text-sm font-medium flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  );
}

function prettyMethod(m: string) {
  if (m === 'hello') return 'Biometric';
  if (m === 'password') return 'Password';
  if (m === 'pin') return 'PIN';
  if (m === 'security_key') return 'Key';
  return m;
}

function DetailRow({
  icon: Icon, label, value, hint, accent,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 min-h-[56px] px-4">
      <M3IconWell className="!w-9 !h-9">
        <Icon className="w-4 h-4" />
      </M3IconWell>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[color:var(--md-on-surface-variant)]">{label}</p>
        <p className={cn(
          'text-sm font-medium truncate',
          accent ? 'text-[color:var(--md-primary)]' : 'text-[color:var(--md-on-surface)]',
        )}>
          {value}
        </p>
      </div>
      {hint && (
        <span className="text-[10px] text-[color:var(--md-on-surface-variant)]">{hint}</span>
      )}
    </div>
  );
}
