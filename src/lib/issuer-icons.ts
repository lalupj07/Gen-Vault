/** Bundled issuer marks (public/issuers) + monogram fallback. */

const ISSUER_ICON_MAP: Record<string, string> = {
  google: '/issuers/google.svg',
  github: '/issuers/github.svg',
  microsoft: '/issuers/microsoft.svg',
  amazon: '/issuers/amazon.svg',
  aws: '/issuers/amazon.svg',
  apple: '/issuers/apple.svg',
  discord: '/issuers/discord.svg',
  meta: '/issuers/meta.svg',
  facebook: '/issuers/meta.svg',
  instagram: '/issuers/meta.svg',
};

export function issuerMonogram(issuer: string): string {
  const t = issuer.trim();
  return t ? t[0]!.toUpperCase() : '?';
}

export function issuerIconSrc(issuer: string): string | null {
  const key = issuer.trim().toLowerCase();
  if (!key) return null;
  if (ISSUER_ICON_MAP[key]) return ISSUER_ICON_MAP[key]!;
  const token = key.split(/[\s.@/_+-]+/).find(Boolean) ?? '';
  return ISSUER_ICON_MAP[token] ?? null;
}
