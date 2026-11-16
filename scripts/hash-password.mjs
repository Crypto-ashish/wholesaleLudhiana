// Prints an scrypt hash for the admin password. Store the output as the
// ADMIN_PASSWORD_HASH Worker secret:  npx wrangler secret put ADMIN_PASSWORD_HASH
// Usage: npm run hash-password -- 'a long, unique password'
import { hashPassword } from "../src/lib/auth.js";

const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error("Usage: npm run hash-password -- '<password of at least 12 characters>'");
  process.exit(1);
}
console.log(hashPassword(pw));
