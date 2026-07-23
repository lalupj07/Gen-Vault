export type OtpauthWarning = {
  level: 'info' | 'warn' | 'block';
  message: string;
};

/** Heuristic phishing / misuse checks for otpauth URIs (offline, no network). */
export function analyzeOtpauthUri(raw: string): OtpauthWarning[] {
  const warnings: OtpauthWarning[] = [];
  const uri = raw.trim();

  if (!uri) return [{ level: 'block', message: 'Empty URI' }];

  if (/^https?:\/\//i.test(uri)) {
    warnings.push({
      level: 'block',
      message: 'This looks like a website URL, not an authenticator QR. Do not paste login pages here.',
    });
    return warnings;
  }

  if (!/^otpauth:\/\//i.test(uri)) {
    warnings.push({
      level: 'block',
      message: 'Not an otpauth:// URI. Only import authenticator provisioning URIs.',
    });
    return warnings;
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return [{ level: 'block', message: 'Malformed otpauth URI' }];
  }

  const type = parsed.hostname.toLowerCase(); // totp | hotp
  if (type !== 'totp' && type !== 'hotp') {
    warnings.push({ level: 'warn', message: `Unusual OTP type “${type}”. Expected totp or hotp.` });
  }

  const secret = parsed.searchParams.get('secret') || '';
  if (!secret || secret.length < 8) {
    warnings.push({ level: 'block', message: 'Missing or too-short secret parameter.' });
  } else if (!/^[A-Z2-7]+=*$/i.test(secret.replace(/\s+/g, ''))) {
    warnings.push({ level: 'warn', message: 'Secret is not valid Base32 — import may fail.' });
  }

  const issuerParam = parsed.searchParams.get('issuer');
  let pathLabel = '';
  try {
    pathLabel = decodeURIComponent(parsed.pathname).replace(/^\//, '');
  } catch {
    return [{ level: 'block', message: 'Malformed URI encoding in label' }];
  }
  const issuer = (issuerParam || pathLabel).toLowerCase();
  const suspicious = [
    'verify-account', 'secure-login', 'account-update', 'wallet-connect',
    'metamask', 'seed-phrase', 'recovery-phrase', 'airdrop', 'claim-reward',
  ];
  if (suspicious.some((s) => issuer.includes(s))) {
    warnings.push({
      level: 'warn',
      message: 'Issuer name matches common phishing patterns. Confirm this QR came from the real service.',
    });
  }

  if (/password|passwd|master.?key/i.test(uri)) {
    warnings.push({
      level: 'warn',
      message: 'URI mentions passwords/keys — authenticators should only hold OTP secrets.',
    });
  }

  const period = Number(parsed.searchParams.get('period') || '30');
  if (period && (period < 10 || period > 120)) {
    warnings.push({ level: 'warn', message: `Unusual period (${period}s). Typical is 30.` });
  }

  if (warnings.length === 0) {
    warnings.push({ level: 'info', message: 'Looks like a standard authenticator URI.' });
  }

  return warnings;
}

export function otpauthBlocked(warnings: OtpauthWarning[]): boolean {
  return warnings.some((w) => w.level === 'block');
}
