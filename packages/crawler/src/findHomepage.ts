/**
 * PRD 5절: 심평원에 홈페이지가 없거나 죽은 링크면 네이버 검색 결과의 공식 홈페이지로 대체한다 ("자동 발견" 태그).
 * 네이버 지역검색 Open API(https://developers.naver.com, 검색 API)의 `link` 필드를 쓴다. 일 25,000회 무료.
 * 키가 없으면 null을 돌려주고 호출자는 건너뛴다.
 */
export interface HomepageGuess {
  url: string;
  source: "naver_local";
  matchedName: string;
  address: string;
}

/** 네이버 검색 API는 초당 호출 제한이 있어 프로세스 전체에서 호출 간격을 둔다 (약 8 req/s). */
let naverQueue: Promise<void> = Promise.resolve();
const NAVER_MIN_GAP_MS = 130;
function naverSlot(): Promise<void> {
  const p = naverQueue.then(() => new Promise<void>((r) => setTimeout(r, NAVER_MIN_GAP_MS)));
  naverQueue = p.catch(() => {});
  return p;
}

const SKIP_HOSTS = /(naver\.com|naver\.me|daum\.net|kakao\.com|instagram\.com|facebook\.com|youtube\.com|blog\.me|tistory\.com|modoo\.at\/?$)/i;

function norm(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, "").replace(/(의료법인|의료재단|재단법인|\(.*?\))/g, "");
}

export async function guessHomepageFromNaver(name: string, address: string | null, opts: { fetchImpl?: typeof fetch; clientId?: string; clientSecret?: string } = {}): Promise<HomepageGuess | null> {
  const id = opts.clientId ?? process.env.NAVER_CLIENT_ID;
  const secret = opts.clientSecret ?? process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return null;
  const f = opts.fetchImpl ?? fetch;
  // 지역명 + 병원명으로 검색 정확도를 높인다
  const region = address?.split(/\s+/).slice(1, 3).join(" ") ?? "";
  const queries = [`${region} ${name}`.trim(), name];
  for (const q of queries) {
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      await naverSlot();
      res = await f(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }, signal: AbortSignal.timeout(10_000) });
      if (res.status !== 429) break;
      // 초당 한도 초과: 점점 길게 기다렸다 재시도
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    if (!res) continue;
    if (!res.ok) {
      if (res.status === 429) throw new Error("NAVER_RATE_LIMIT");
      if (res.status === 401 || res.status === 403) throw new Error(`NAVER_AUTH ${res.status}: ${(await res.text()).slice(0, 120)}`);
      continue;
    }
    const body = (await res.json()) as { items?: { title: string; link: string; address: string; roadAddress: string }[] };
    const target = norm(name);
    // 정확히 같은 이름 > 이름이 포함되되 군더더기가 짧은 것(지점·카페 등 제외). 링크 없는 항목은 건너뛴다.
    const scored = (body.items ?? [])
      .map((it) => {
        const title = norm(it.title);
        const link = (it.link ?? "").trim();
        const linkOk = /^https?:\/\//i.test(link) && !SKIP_HOSTS.test(link);
        let score = -1;
        if (title === target) score = 3;
        else if (title.startsWith(target) && title.length <= target.length + 3) score = 2;
        else if (title.includes(target) && title.length <= target.length + 6) score = 1;
        return { it, link, score: linkOk ? score : -1 };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best) return { url: best.link, source: "naver_local", matchedName: best.it.title.replace(/<[^>]+>/g, ""), address: best.it.roadAddress || best.it.address };
  }
  return null;
}
