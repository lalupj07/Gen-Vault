// RFC 6238 compliant TOTP implementation for browser fallback
// This provides a secure alternative to the weak implementation in api.ts

export interface TotpCode {
  code: string;
  seconds_remaining: number;
  period: number;
}

/**
 * Convert base32 string to Uint8Array
 */
function base32ToBytes(base32: string): Uint8Array {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';

  // Remove padding and convert to uppercase
  base32 = base32.replace(/=+$/, '').toUpperCase();

  // Convert base32 to binary string
  for (let i = 0; i < base32.length; i++) {
    const val = base32Chars.indexOf(base32[i]);
    if (val === -1) throw new Error('Invalid base32 character');
    bits += val.toString(2).padStart(5, '0');
  }

  // Convert binary string to hex
  for (let i = 0; i < bits.length; i += 8) {
    if (bits.length - i >= 8) {
      hex += parseInt(bits.substr(i, 8), 2).toString(16).padStart(2, '0');
    }
  }

  // Convert hex to Uint8Array
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }

  return bytes;
}

/**
 * HMAC-SHA1 implementation
 */
async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message as BufferSource);
  return new Uint8Array(signature);
}

/**
 * Generate a secure TOTP code (RFC 6238 compliant)
 */
export async function generateTotpCode(
  secret: string,
  digits: number = 6,
  period: number = 30
): Promise<TotpCode> {
  try {
    // Convert base32 secret to bytes
    const secretBytes = base32ToBytes(secret);

    // Calculate time counter
    const time = Math.floor(Date.now() / 1000);
    const counter = Math.floor(time / period);
    const counterBytes = new ArrayBuffer(8);
    const counterView = new DataView(counterBytes);
    counterView.setUint32(4, counter, false); // Big-endian

    // Generate HMAC-SHA1
    const hmac = await hmacSha1(secretBytes, new Uint8Array(counterBytes));

    // Dynamic truncation
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = 
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    // Generate code
    const code = (binary % Math.pow(10, digits)).toString().padStart(digits, '0');
    
    // Calculate remaining time
    const secondsRemaining = period - (time % period);

    return {
      code,
      seconds_remaining: secondsRemaining,
      period
    };
  } catch (error) {
    throw new Error(`TOTP generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify a TOTP code
 */
export async function verifyTotpCode(
  secret: string,
  code: string,
  digits: number = 6,
  period: number = 30,
  window: number = 1
): Promise<boolean> {
  try {
    const time = Math.floor(Date.now() / 1000);
    const counter = Math.floor(time / period);

    // Check current counter and adjacent windows
    for (let i = -window; i <= window; i++) {
      const testCounter = counter + i;
      const counterBytes = new ArrayBuffer(8);
      const counterView = new DataView(counterBytes);
      counterView.setUint32(4, testCounter, false);

      const secretBytes = base32ToBytes(secret);
      const hmac = await hmacSha1(secretBytes, new Uint8Array(counterBytes));

      const offset = hmac[hmac.length - 1] & 0x0f;
      const binary = 
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

      const expectedCode = (binary % Math.pow(10, digits)).toString().padStart(digits, '0');

      if (expectedCode === code) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Generate a cryptographically secure random TOTP secret
 */
export function generateTotpSecret(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += chars[array[i] % chars.length];
  }
  
  return secret;
}

/**
 * Generate a provisioning URI for QR codes
 */
export function generateProvisioningUri(
  secret: string,
  accountName: string,
  issuer: string,
  digits: number = 6,
  period: number = 30
): string {
  const params = new URLSearchParams({
    secret: secret,
    issuer: issuer,
    algorithm: 'SHA1',
    digits: digits.toString(),
    period: period.toString()
  });

  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?${params.toString()}`;
}
