/** GenXis Innovations — product & company metadata (single source of truth). */

export const COMPANY = {
  name: 'GenXis Innovations',
  email: 'genxisinnovation@outlook.com',
  website: 'https://www.genxisinnovation.in',
  websiteDisplay: 'www.genxisinnovation.in',
  // Publish these paths on the site before Play submit (content mirrors store/*.md)
  privacyUrl: 'https://www.genxisinnovation.in/privacy',
  termsUrl: 'https://www.genxisinnovation.in/terms',
  /** Windows — Microsoft Store listing */
  microsoftStoreUrl:
    'https://apps.microsoft.com/detail/9P8PJDTP506T?hl=en-us&gl=IN&ocid=pdpshare',
  /** Android — set when Play listing is live */
  playStoreUrl: null as string | null,
  playStoreLabel: 'Google Play — release soon',
  copyright: '© 2025 GenXis Innovations. All rights reserved.',
  licenses: ['Apache License 2.0', 'MIT License'] as const,
  licenseSpdx: 'MIT',
} as const;

export const PRODUCT = {
  name: 'GenVault',
  version: '2.3.0',
  build: '2.3.0',
  tagline: 'Offline Authentication Vault',
  shortDescription: 'Offline 2FA vault with encrypted local credential storage',
} as const;

export const APP_TITLE = `${PRODUCT.name} v${PRODUCT.version} — ${PRODUCT.tagline}`;
