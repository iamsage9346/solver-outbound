import "@solver/shared/node";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://solver:solver@localhost:5433/outbound" },
  casing: "snake_case",
});
