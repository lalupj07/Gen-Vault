async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Demo-only. Not Argon2. Never use for production vault. */
export async function hashPassword(password: string): Promise<string> {
  return sha256Hex(`genvault-demo|${password}`);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const next = await hashPassword(password);
  return next === hash;
}
