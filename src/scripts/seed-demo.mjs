/**
 * Seed script — creates the demo admin user in Vercel KV.
 * Run after deploying to Vercel with KV connected:
 *
 *   node src/scripts/seed-demo.mjs
 *
 * Or locally with KV configured:
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... node src/scripts/seed-demo.mjs
 *
 * The script also prints the bcrypt hash of 'demo123' so you can
 * store it in .env.local for reference.
 */

import { hash } from "bcryptjs";
import { seedAdminUser } from "../lib/users";

const DEMO_EMAIL = process.env.ADMIN_EMAIL ?? "demo@setupx.test";
const DEMO_PASSWORD = "demo123";
const DEMO_NAME = "Demo User";

async function main() {
  console.log("[seed] Generating bcrypt hash for password 'demo123'...");
  const passwordHash = await hash(DEMO_PASSWORD, 12);
  console.log(`[seed] Hash: ${passwordHash}`);
  console.log(`[seed] Store in .env.local: ADMIN_PASSWORD_HASH=${passwordHash}`);
  console.log("");

  console.log(`[seed] Creating demo user: ${DEMO_EMAIL}`);
  try {
    const user = await seedAdminUser(DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME);
    console.log("[seed] Demo user created/verified:");
    console.log(`  id: ${user.id}`);
    console.log(`  email: ${user.email}`);
    console.log(`  name: ${user.name}`);
    console.log(`  isAdmin: ${user.isAdmin}`);
    console.log(`  subscriptionTier: ${user.subscriptionTier}`);
  } catch (err) {
    console.error("[seed] Error:", err);
    process.exit(1);
  }
}

main();
