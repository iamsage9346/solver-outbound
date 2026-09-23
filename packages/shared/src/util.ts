export function yearsSince(date: Date | string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/** yyyymmdd → Date */
export function parseYmd(s: string | null | undefined): Date | null {
  if (!s || !/^\d{8}$/.test(s)) return null;
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+09:00`);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isDryRun(): boolean {
  return process.env.DRY_RUN !== "false";
}
