/** PRD 7절: 마크다운 템플릿 + 변수 치환. 변수가 비어 있으면 발송을 막는다. */
const VAR_RE = /\{([^{}]+)\}/g;

export function extractVariables(template: string): string[] {
  const set = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) set.add(m[1]!.trim());
  return [...set];
}

export interface RenderResult {
  text: string;
  missing: string[];
}

export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): RenderResult {
  const missing: string[] = [];
  const text = template.replace(VAR_RE, (_, raw: string) => {
    const key = raw.trim();
    const v = vars[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      missing.push(key);
      return `{${key}}`;
    }
    return String(v);
  });
  return { text, missing: [...new Set(missing)] };
}
