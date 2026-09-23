import "@solver/shared/node";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

const db = createDb();
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
console.log("migrations applied");
process.exit(0);
