import "server-only";
import "@solver/shared/node";
import { getDb } from "@solver/db";
import { createContext } from "@solver/pipeline";

export const db = getDb();
export const ctx = createContext({ db });
