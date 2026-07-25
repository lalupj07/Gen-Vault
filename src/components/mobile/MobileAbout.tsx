'use client';

import { ExternalLink, Lightbulb, Mail, Shield } from 'lucide-react';
import { COMPANY, PRODUCT } from '@/lib/company';
import { useI18n } from '@/lib/i18n';
import { GlassSurface, M3IconWell } from './m3';
import { isDemoMode } from '@/lib/demo/flag';

export default function MobileAbout() {
  const { t } = useI18n();
  const featureMailto =
    `mailto:${COMPANY.email}` +
    `?subject=${encodeURIComponent('GenVault Feature Request')}` +
    `&body=${encodeURIComponent('Feature idea:\n\nWhy it helps:\n\n')}`;

  return (
    <div className="space-y-5 pt-2 pb-4">
      <div className="flex items-center gap-3">
        <M3IconWell>
          <Shield className="w-6 h-6" />
        </M3IconWell>
        <div>
          <h2 className="m3-title-lg">{PRODUCT.name}</h2>
          <p className="text-xs text-[color:var(--md-on-surface-variant)]">v{PRODUCT.version}</p>
        </div>
      </div>
      <p className="m3-body text-[color:var(--md-on-surface-variant)]">{PRODUCT.tagline}</p>
      {isDemoMode() && (
        <p className="text-sm text-[color:var(--md-on-surface-variant)]">
          Browser demo only — not encrypted like the real GenVault app. Do not store real secrets.
        </p>
      )}
      <p className="text-xs text-[color:var(--md-on-surface-variant)]">{t('mobile.about.blurb')}</p>
      <GlassSurface className="overflow-hidden p-0 divide-y divide-[color:var(--md-outline-variant)]">
        <a
          href={COMPANY.microsoftStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface)]"
        >
          Download on Microsoft Store <ExternalLink className="w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
        </a>
        {COMPANY.playStoreUrl ? (
          <a
            href={COMPANY.playStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface)]"
          >
            Get it on Google Play <ExternalLink className="w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
          </a>
        ) : (
          <div className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface-variant)]">
            {COMPANY.playStoreLabel}
          </div>
        )}
        <a
          href={COMPANY.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface)]"
        >
          {t('mobile.about.privacy')} <ExternalLink className="w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
        </a>
        <a
          href={COMPANY.termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface)]"
        >
          {t('mobile.about.terms')} <ExternalLink className="w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
        </a>
        <a
          href={featureMailto}
          className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface)]"
        >
          {t('mobile.about.request')} <Lightbulb className="w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
        </a>
        <a
          href={`mailto:${COMPANY.email}?subject=GenVault%20Support`}
          className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface)]"
        >
          {t('mobile.about.support')} <Mail className="w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
        </a>
        <a
          href={COMPANY.website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between min-h-[52px] px-4 text-sm text-[color:var(--md-on-surface)]"
        >
          {COMPANY.websiteDisplay} <ExternalLink className="w-4 h-4 text-[color:var(--md-on-surface-variant)]" />
        </a>
      </GlassSurface>
      <p className="text-[11px] text-[color:var(--md-on-surface-variant)]">{COMPANY.name} · {COMPANY.copyright}</p>
    </div>
  );
}
