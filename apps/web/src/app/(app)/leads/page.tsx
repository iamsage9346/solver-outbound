import Link from "next/link";
import { Suspense } from "react";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, TIERS, TIER_LABEL } from "@solver/shared";
import { Toolbar, PanelTitle } from "@/components/shell/page";
import { LeadsWorkspace } from "@/components/leads/workspace";
import { CsvButtons } from "@/components/leads/csv";
import { Button } from "@/components/ui/button";
import { countLeads, leadFacets, listLeads, PAGE_SIZE, type LeadFilters } from "@/lib/queries";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filters: LeadFilters = { q: get("q"), sido: get("sido"), sggu: get("sggu"), tier: get("tier"), status: get("status"), email: get("email") as LeadFilters["email"], cl: get("cl") };
  const sel = get("sel") ?? null;
  const page = Math.max(1, Number(get("page") ?? 1) || 1);
  const [rows, total, facets] = await Promise.all([listLeads(filters, page), countLeads(filters), leadFacets()]);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/leads?${query ? query + "&" : ""}page=${p}`;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <>
      <Toolbar
        title="리드"
        subtitle={`${total.toLocaleString()}곳`}
        actions={
          <>
            <div className="mr-2 flex items-center gap-1 text-[13px] text-muted-foreground tabular">
              <Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1} className={cn("flex size-7 items-center justify-center rounded-md hover:bg-muted", page <= 1 && "pointer-events-none opacity-40")}>
                <ChevronLeft className="size-4" strokeWidth={1.5} />
              </Link>
              <span>
                {from.toLocaleString()}–{to.toLocaleString()} / {total.toLocaleString()}
              </span>
              <Link href={pageHref(Math.min(pages, page + 1))} aria-disabled={page >= pages} className={cn("flex size-7 items-center justify-center rounded-md hover:bg-muted", page >= pages && "pointer-events-none opacity-40")}>
                <ChevronRight className="size-4" strokeWidth={1.5} />
              </Link>
            </div>
            <CsvButtons query={query} />
          </>
        }
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="w-[280px] shrink-0 overflow-y-auto border-r p-4">
          <Filters facets={facets} filters={filters} />
        </aside>
        <Suspense>
          <LeadsWorkspace rows={rows} initialSel={sel} />
        </Suspense>
      </div>
    </>
  );
}

function Sel({ name, label, options, value }: { name: string; label: string; options: { v: string; l: string; c?: number }[]; value?: string }) {
  return (
    <label className="mb-3 block text-[13px]">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="h-8 w-full rounded-md border bg-background px-2 focus:border-primary focus:outline-none">
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
            {o.c != null ? ` (${o.c})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function Filters({ facets, filters }: { facets: Awaited<ReturnType<typeof leadFacets>>; filters: LeadFilters }) {
  const cnt = (list: { k: string | null; c: number }[], k: string) => list.find((r) => r.k === k)?.c;
  return (
    <form method="get" action="/leads">
      <PanelTitle>필터</PanelTitle>
      <label className="mb-3 block text-[13px]">
        <span className="mb-1 block text-muted-foreground">검색</span>
        <input name="q" defaultValue={filters.q ?? ""} placeholder="병원명 · 주소" className="h-8 w-full rounded-md border px-2 focus:border-primary focus:outline-none" />
      </label>
      <Sel name="sido" label="시도" value={filters.sido} options={facets.bySido.filter((r) => r.k).map((r) => ({ v: r.k!, l: r.k!, c: r.c }))} />
      <label className="mb-3 block text-[13px]">
        <span className="mb-1 block text-muted-foreground">시군구</span>
        <input name="sggu" defaultValue={filters.sggu ?? ""} placeholder="강남구" className="h-8 w-full rounded-md border px-2 focus:border-primary focus:outline-none" />
      </label>
      <Sel name="cl" label="종별" value={filters.cl} options={[{ v: "31", l: "의원" }, { v: "21", l: "병원" }, { v: "11", l: "종합병원" }]} />
      <Sel name="tier" label="Tier" value={filters.tier} options={TIERS.map((t) => ({ v: t, l: TIER_LABEL[t], c: cnt(facets.byTier, t) }))} />
      <Sel name="status" label="상태" value={filters.status} options={LEAD_STATUSES.map((s) => ({ v: s, l: LEAD_STATUS_LABEL[s], c: cnt(facets.byStatus, s) }))} />
      <Sel name="email" label="이메일" value={filters.email} options={[{ v: "yes", l: "있음" }, { v: "no", l: "없음 (전화 우선)" }]} />
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="sm">
          적용
        </Button>
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href="/leads">초기화</Link>
        </Button>
      </div>
    </form>
  );
}
