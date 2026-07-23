// Browser-compatible cryptographic utilities
// Implements secure password hashing using Web Crypto API

export interface CryptoHashResult {
  hash: string;
  salt: string;
  iterations: number;
  memory: number;
  parallelism: number;
}

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive a key from password using PBKDF2 (browser-compatible alternative to Argon2)
 * Note: In production, this should use a WebAssembly implementation of Argon2
 */
export async function deriveKey(
  password: string, 
  salt: string, 
  iterations: number = 100000,
  keyLength: number = 32
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = new Uint8Array(salt.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));

  const key = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256'
    },
    key,
    keyLength * 8
  );
}

/**
 * Hash a password using PBKDF2 with proper salt generation
 */
export async function hashPassword(
  password: string,
  options?: {
    iterations?: number;
    salt?: string;
  }
): Promise<CryptoHashResult> {
  const iterations = options?.iterations || 100000;
  const salt = options?.salt || generateSalt(32);
  
  const derivedKey = await deriveKey(password, salt, iterations);
  const hashArray = new Uint8Array(derivedKey);
  const hashHex = Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');

  return {
    hash: hashHex,
    salt,
    iterations,
    memory: 0, // PBKDF2 doesn't use memory parameter
    parallelism: 1
  };
}

/**
 * Verify a password against a stored hash
 */
export async function verifyPassword(
  password: string, 
  storedHash: CryptoHashResult
): Promise<boolean> {
  const { hash: storedHashHex, salt, iterations } = storedHash;
  
  const derivedKey = await deriveKey(password, salt, iterations);
  const hashArray = new Uint8Array(derivedKey);
  const computedHashHex = Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison to prevent timing attacks
  return constantTimeCompare(computedHashHex, storedHashHex);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate a secure random password for vault encryption
 */
export function generateSecurePassword(length: number = 32): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;
  const n = Math.max(length, 12);
  const array = new Uint8Array(n);
  crypto.getRandomValues(array);

  // Guarantee one char from each class, then fill from full charset.
  const picks = [
    upper[array[0] % upper.length],
    lower[array[1] % lower.length],
    digits[array[2] % digits.length],
    special[array[3] % special.length],
  ];
  for (let i = 4; i < n; i++) {
    picks.push(all[array[i] % all.length]);
  }
  // Shuffle
  for (let i = picks.length - 1; i > 0; i--) {
    const j = array[i % array.length] % (i + 1);
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks.join('');
}

/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// NOTE: Vault unlock secrets are no longer derived client-side from the
// Cognito `sub` claim + a localStorage salt. Both values are readable by
// anyone with local filesystem access (JWTs are unencrypted base64, and
// localStorage is plaintext), which meant the vault's AES-256-GCM encryption
// could be bypassed without ever knowing the user's real password.
//
// The vault master key is now generated as a genuinely random 256-bit
// secret inside the Rust/Tauri backend and stored in the OS-native secure
// credential store (Windows Credential Manager / macOS Keychain / Linux
// Secret Service) via the `keyring` crate. See `src-tauri/src/store.rs`.
