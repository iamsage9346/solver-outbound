import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof createDb> | null = null;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10, prepare: false });
  return drizzle(client, { schema, casing: "snake_case" });
}

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export type Db = ReturnType<typeof createDb>;
