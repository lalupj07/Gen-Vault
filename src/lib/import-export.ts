// Import/Export utilities for authenticator formats

export interface GoogleAuthEntry {
  secret: string;
  name: string;
  issuer: string;
  algorithm: string;
  digits: number;
  period: number;
  type?: string; // 'TOTP' or 'HOTP'
  counter?: number;
}

export interface AuthyExport {
  apps: Array<{
    name: string;
    secret: string;
    originalIssuer?: string;
  }>;
}

/**
 * Parse Google Authenticator export JSON
 * Format: [{ "secret": "...", "name": "...", "issuer": "...", "algorithm": "SHA1", "digits": 6, "period": 30, "type": "TOTP" }]
 */
export function parseGoogleAuthExport(json: string): GoogleAuthEntry[] {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) {
      throw new Error('Invalid format: expected array');
    }
    return data.map((entry: any) => ({
      secret: entry.secret,
      name: entry.name || 'Unknown',
      issuer: entry.issuer || entry.name || 'Unknown',
      algorithm: entry.algorithm || 'SHA1',
      digits: entry.digits || 6,
      period: entry.period || 30,
      type: entry.type || 'TOTP',
      counter: entry.counter || 0,
    }));
  } catch (e) {
    throw new Error('Failed to parse Google Authenticator export: ' + (e instanceof Error ? e.message : 'Unknown error'));
  }
}

/**
 * Parse otpauth:// URI (from QR codes)
 * Format: otpauth://totp/Issuer:Account?secret=...&issuer=...&algorithm=...&digits=...&period=...
 * or otpauth://hotp/Issuer:Account?secret=...&issuer=...&algorithm=...&digits=...&counter=...
 */
export function parseOtpAuthUri(uri: string): GoogleAuthEntry {
  try {
    const url = new URL(uri);
    
    if (url.protocol !== 'otpauth:') {
      throw new Error('Invalid protocol: expected otpauth://');
    }

    const type = url.hostname; // 'totp' or 'hotp'
    const pathParts = url.pathname.slice(1).split(':'); // Remove leading /
    const label = pathParts[0] || '';
    
    // Parse label to extract issuer and account
    let issuer = '';
    let name = '';
    if (pathParts.length > 1) {
      issuer = decodeURIComponent(pathParts[0]);
      name = decodeURIComponent(pathParts[1]);
    } else {
      name = decodeURIComponent(label);
    }

    const secret = url.searchParams.get('secret') || '';
    const algorithm = url.searchParams.get('algorithm') || 'SHA1';
    const digits = parseInt(url.searchParams.get('digits') || '6', 10);
    const period = parseInt(url.searchParams.get('period') || '30', 10);
    const counter = parseInt(url.searchParams.get('counter') || '0', 10);

    if (!secret) {
      throw new Error('Missing secret in URI');
    }

    return {
      secret,
      name,
      issuer: url.searchParams.get('issuer') || issuer || name,
      algorithm,
      digits,
      period,
      type: type.toUpperCase(),
      counter,
    };
  } catch (e) {
    throw new Error('Failed to parse otpauth URI: ' + (e instanceof Error ? e.message : 'Unknown error'));
  }
}

/**
 * Convert vault entries to Google Authenticator export format
 */
export function toGoogleAuthExport(entries: any[]): string {
  const exportData = entries.map((entry) => ({
    secret: entry.secret,
    name: entry.name,
    issuer: entry.issuer,
    algorithm: entry.algorithm || 'SHA1',
    digits: entry.digits || 6,
    period: entry.period || 30,
    type: entry.algorithm === 'hotp' ? 'HOTP' : 'TOTP',
    counter: entry.counter || 0,
  }));
  return JSON.stringify(exportData, null, 2);
}

/**
 * Detect format and parse import data
 */
export function parseImportData(data: string): GoogleAuthEntry[] {
  // Try JSON first (Google Authenticator format)
  if (data.trim().startsWith('[') || data.trim().startsWith('{')) {
    return parseGoogleAuthExport(data);
  }
  
  // Try otpauth URI
  if (data.trim().startsWith('otpauth://')) {
    return [parseOtpAuthUri(data)];
  }
  
  // Try base64 encoded JSON (some exporters)
  try {
    const decoded = atob(data.trim());
    if (decoded.startsWith('[') || decoded.startsWith('{')) {
      return parseGoogleAuthExport(decoded);
    }
  } catch {}
  
  throw new Error('Unsupported import format. Expected Google Authenticator JSON or otpauth:// URI');
}
