// `npm run db:seed -w web`: writes the "Sample data" session into DATABASE_URL.
// Standalone script, so it builds its own client instead of importing db.ts (server-only).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createDemoAdmin } from "./admin";
import { createPostgresStore, type StoreDb } from "./postgres";
import { reseedSample } from "./sample";
import * as schema from "./schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fall back to the shell environment.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (apps/web/.env.local).");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema }) as unknown as StoreDb;
try {
  await reseedSample(createPostgresStore(db), createDemoAdmin(db));
  console.log("Sample session seeded.");
} finally {
  await client.end();
}
