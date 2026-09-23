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
    const res = await f(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`, { headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret } });
    if (!res.ok) {
      if (res.status === 429) throw new Error("NAVER_RATE_LIMIT");
      if (res.status === 401 || res.status === 403) throw new Error(`NAVER_AUTH ${res.status}: ${(await res.text()).slice(0, 120)}`);
      continue;
    }
    const body = (await res.json()) as { items?: { title: string; link: string; address: string; roadAddress: string }[] };
    const target = norm(name);
    for (const it of body.items ?? []) {
      const title = norm(it.title);
      const nameOk = title.includes(target) || target.includes(title);
      if (!nameOk) continue;
      const link = (it.link ?? "").trim();
      if (!/^https?:\/\//i.test(link) || SKIP_HOSTS.test(link)) continue;
      return { url: link, source: "naver_local", matchedName: it.title.replace(/<[^>]+>/g, ""), address: it.roadAddress || it.address };
    }
  }
  return null;
}
