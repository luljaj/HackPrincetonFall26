import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read Next.js env files, so load .env.local when it exists.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

// `npm run db:generate -w web` writes SQL migrations to ./drizzle (commit them).
// `npm run db:migrate -w web` applies them to DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/storage/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
