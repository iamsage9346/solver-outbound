import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof createDb> | null = null;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const serverless = !!process.env.VERCEL;
  // 서버리스(Fluid)에서는 인스턴스가 재사용되므로 소수의 연결을 오래 유지하는 편이 빠르다
  const client = postgres(url, { max: serverless ? 3 : 10, prepare: false, idle_timeout: serverless ? 300 : undefined, connect_timeout: 10 });
  return drizzle(client, { schema, casing: "snake_case" });
}

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export type Db = ReturnType<typeof createDb>;
