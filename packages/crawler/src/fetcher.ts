import { fetch as undiciFetch } from "undici";
import robotsParser from "robots-parser";
import { DEFAULT_SETTINGS, sleep } from "@solver/shared";
import type { CrawlErrorCode, FetchImpl, FetchResult } from "./types";

const UA = DEFAULT_SETTINGS.crawl.userAgent;
const TIMEOUT_MS = 15_000;

type Robot = ReturnType<typeof robotsParser>;
const robotsCache = new Map<string, Promise<Robot | null>>();
const lastHit = new Map<string, number>();

export function mapError(err: unknown): CrawlErrorCode {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code ?? e?.code ?? "";
  const msg = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || /timeout/i.test(msg) || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") return "TIMEOUT";
  if (/CERT|certificate|self signed|SSL|TLS/i.test(code + msg)) return "CERT_ERROR";
  if (code === "ENOTFOUND" || code === "ECONNREFUSED") return "NOT_FOUND";
  return "BLOCKED";
}

export function statusToError(status: number): CrawlErrorCode {
  if (status === 404 || status === 410) return "NOT_FOUND";
  if (status === 403 || status === 401 || status === 429 || status === 503) return "BLOCKED";
  if (status >= 400) return "BLOCKED";
  return null;
}

/** 도메인당 요청 간격을 보장한다. */
export async function throttle(host: string, intervalMs: number = DEFAULT_SETTINGS.crawl.domainIntervalMs) {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + intervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

export async function getRobots(origin: string, fetchImpl: FetchImpl = fetchPage): Promise<Robot | null> {
  if (!robotsCache.has(origin)) {
    robotsCache.set(
      origin,
      (async () => {
        try {
          const r = await fetchImpl(`${origin}/robots.txt`);
          if (r.status !== 200 || !r.body) return null;
          return robotsParser(`${origin}/robots.txt`, r.body);
        } catch {
          return null;
        }
      })(),
    );
  }
  return robotsCache.get(origin)!;
}

export async function isAllowedByRobots(url: string, fetchImpl?: FetchImpl): Promise<boolean> {
  const { origin } = new URL(url);
  const robots = await getRobots(origin, fetchImpl);
  if (!robots) return true;
  return robots.isAllowed(url, UA) !== false;
}

export function resetCaches() {
  robotsCache.clear();
  lastHit.clear();
}

/** 헤더뿐 아니라 본문 수신까지 포함한 하드 타임아웃. 느리게 흘려보내는 서버에 소켓이 붙잡히지 않게 한다. */
function withHardTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`hard timeout after ${ms}ms`), { name: "TimeoutError" })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export const fetchPage: FetchImpl = (url) => withHardTimeout(fetchPageInner(url), TIMEOUT_MS + 5_000);

const fetchPageInner: FetchImpl = async (url) => {
  const started = Date.now();
  try {
    const res = await undiciFetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "ko-KR,ko;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ttfbMs = Date.now() - started;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const body = await res.text();
    return { url, finalUrl: res.url || url, status: res.status, headers, body, ttfbMs, errorCode: statusToError(res.status) };
  } catch (err) {
    return { url, finalUrl: url, status: null, headers: {}, body: "", ttfbMs: null, errorCode: mapError(err) };
  }
};
