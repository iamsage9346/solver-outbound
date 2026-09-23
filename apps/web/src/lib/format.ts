export function fmtDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
export function fmtRel(d: Date | string | null | undefined) {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const m = Math.round((Date.now() - t) / 60000);
  if (Math.abs(m) < 60) return `${m}분 전`;
  if (Math.abs(m) < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}
export function years(est: string | null) {
  if (!est) return null;
  return ((Date.now() - new Date(est).getTime()) / (365.25 * 86400000)).toFixed(1);
}
