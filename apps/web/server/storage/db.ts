import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One client per server process; reused across Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof create> };

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it to apps/web/.env.local (server-only).");
  }
  // prepare: false keeps it compatible with pooled (PgBouncer-style) connection strings.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export function getDb() {
  globalForDb.__db ??= create();
  return globalForDb.__db;
}
