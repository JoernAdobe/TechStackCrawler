import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Passwort-Hashing für den Break-Glass-Login.
 *
 * Empfohlenes Format: `scrypt$<saltHex>$<hashHex>` (gesalzen, speicherhart).
 * Erzeugen: `npm run hash-dashboard-password -- '<passwort>'` (im Ordner project/).
 *
 * Legacy: 64-stelliger SHA-256-Hex-Hash (ungesalzen) wird aus Kompatibilitätsgründen
 * weiter akzeptiert, beim Start aber als Warnung gemeldet.
 */
const SCRYPT_KEYLEN = 64;
const SCRYPT_RE = /^scrypt\$([0-9a-f]{32,})\$([0-9a-f]{128})$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

export type PasswordHashFormat = 'scrypt' | 'sha256' | 'invalid';

export function passwordHashFormat(stored: string): PasswordHashFormat {
  if (SCRYPT_RE.test(stored)) return 'scrypt';
  if (SHA256_RE.test(stored)) return 'sha256';
  return 'invalid';
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const scrypt = SCRYPT_RE.exec(stored);
  if (scrypt) {
    const expected = Buffer.from(scrypt[2], 'hex');
    const given = scryptSync(password, Buffer.from(scrypt[1], 'hex'), expected.length);
    return timingSafeEqual(given, expected);
  }
  if (SHA256_RE.test(stored)) {
    const expected = Buffer.from(stored, 'hex');
    const given = createHash('sha256').update(password).digest();
    return timingSafeEqual(given, expected);
  }
  return false;
}
