import { defineConfig } from "drizzle-kit";

// `npm run db:generate -w web` writes SQL migrations to ./drizzle (commit them).
// `npm run db:migrate -w web` applies them to DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/storage/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
