"use server";
import { revalidatePath } from "next/cache";
import { importCsvRows } from "@solver/pipeline";
import { ctx } from "./db";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "",
      q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]!);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i] ?? `col${i}`, v])));
}

export async function importCsvAction(text: string) {
  const r = await importCsvRows(ctx, parseCsv(text));
  revalidatePath("/leads");
  return r;
}
