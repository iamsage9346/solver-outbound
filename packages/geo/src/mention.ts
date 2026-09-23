export interface MentionResult {
  mentioned: boolean;
  /** 응답에 등장한 병원명들 중 대상 병원의 1-based 순서 */
  position: number | null;
  /** 함께 언급된 다른 병원 (등장 순서, 중복 제거) */
  competitors: string[];
}

const SUFFIX = "(?:정형외과의원|정형외과병원|정형외과|의원|병원|클리닉|센터)";
/** 한글·영문·숫자 조합 + 병원류 접미사. 공백 1칸 허용 (예: "강남 정형외과의원") */
const NAME_RE = new RegExp(`[가-힣A-Za-z0-9&·]+(?:\\s?[가-힣A-Za-z0-9&·]+)*?\\s?${SUFFIX}`, "g");

const GENERIC = new Set(["정형외과", "의원", "병원", "클리닉", "센터", "정형외과의원", "정형외과병원", "대학병원", "종합병원", "동물병원"]);

export function normalizeHospitalName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/(의원|병원|클리닉|센터)$/g, "")
    .replace(/(의원|병원)$/g, "")
    .toLowerCase();
}

function extractCandidates(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(NAME_RE)) {
    let raw = m[0].trim();
    // 조사·앞말 제거: "근처 강남정형외과" → 문장 내 마지막 2어절만 취함
    const words = raw.split(/\s+/);
    if (words.length > 2) raw = words.slice(-2).join(" ");
    // 앞에 붙은 흔한 수식어 제거
    raw = raw.replace(/^(추천|근처|인근|유명한|좋은|있는|위치한|같은|또는|그리고|및|과|와|은|는|이|가|의|에|서울|경기|인천)\s+/, "");
    if (GENERIC.has(raw.replace(/\s+/g, ""))) continue;
    // "강남구 정형외과", "역삼동 병원"처럼 지역명 + 일반명사 조합은 병원명이 아니다
    if (/^[가-힣]+(시|구|군|동|읍|면|역)\s?(정형외과의원|정형외과병원|정형외과|의원|병원|클리닉|센터)$/.test(raw)) continue;
    found.push(raw);
  }
  return found;
}

export function detectMention(answerText: string, hospitalName: string, aliases: string[] = []): MentionResult {
  const targets = [hospitalName, ...aliases].map(normalizeHospitalName).filter(Boolean);
  const candidates = extractCandidates(answerText);

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = normalizeHospitalName(c);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(c);
  }

  const isTarget = (c: string) => {
    const key = normalizeHospitalName(c);
    return targets.some((t) => key === t || key.includes(t) || t.includes(key));
  };

  let position: number | null = null;
  const competitors: string[] = [];
  let idx = 0;
  for (const c of ordered) {
    idx += 1;
    if (isTarget(c)) {
      if (position === null) position = idx;
    } else {
      competitors.push(c.replace(/\s+/g, " "));
    }
  }

  // 정규식이 못 잡아도 본문에 정규화된 이름이 그대로 있으면 언급으로 본다
  let mentioned = position !== null;
  if (!mentioned) {
    const flat = answerText.replace(/\s+/g, "").toLowerCase();
    mentioned = targets.some((t) => t.length >= 2 && flat.includes(t));
    if (mentioned) position = ordered.length + 1;
  }

  return { mentioned, position: mentioned ? position : null, competitors };
}
