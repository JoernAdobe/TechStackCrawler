/**
 * Erzeugt einen scrypt-Hash für DASHBOARD_PASSWORD_HASH (Break-Glass-Login).
 * Aufruf (im Ordner project/): npm run hash-dashboard-password -- '<passwort>'
 */
import { hashPassword } from '../server/src/utils/passwordHash.js';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error("Usage: npm run hash-dashboard-password -- '<passwort mit min. 12 Zeichen>'");
  process.exit(1);
}
console.log(hashPassword(password));
