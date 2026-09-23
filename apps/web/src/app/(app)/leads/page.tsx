import Link from "next/link";
import { Suspense } from "react";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, TIERS, TIER_LABEL } from "@solver/shared";
import { Toolbar, ThreePane, PanelTitle, Field } from "@/components/shell/page";
import { StatusBadge, TierBadge } from "@/components/shell/badges";
import { LeadsTable } from "@/components/leads/table";
import { CsvButtons } from "@/components/leads/csv";
import { Button } from "@/components/ui/button";
import { getLeadDetail, leadFacets, listLeads, type LeadFilters } from "@/lib/queries";
import { fmtRel } from "@/lib/format";
import { EVENT_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filters: LeadFilters = { q: get("q"), sido: get("sido"), sggu: get("sggu"), tier: get("tier"), status: get("status"), email: get("email") as LeadFilters["email"], cl: get("cl") };
  const sel = get("sel") ?? null;
  const [rows, facets, detail] = await Promise.all([listLeads(filters), leadFacets(), sel ? getLeadDetail(sel) : null]);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <Toolbar title="리드" subtitle={`${rows.length}곳`} actions={<CsvButtons query={query} />} />
      <ThreePane
        left={<Filters facets={facets} filters={filters} />}
        center={
          <Suspense>
            <LeadsTable rows={rows} selected={sel} />
          </Suspense>
        }
        right={detail ? <Summary d={detail} /> : <div className="text-[13px] text-muted-foreground">행을 선택하면 요약이 표시됩니다. j/k로 이동, Enter로 열기.</div>}
      />
    </>
  );
}

function Filters({ facets, filters }: { facets: Awaited<ReturnType<typeof leadFacets>>; filters: LeadFilters }) {
  const Sel = ({ name, label, options, value }: { name: string; label: string; options: { v: string; l: string; c?: number }[]; value?: string }) => (
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

function Summary({ d }: { d: NonNullable<Awaited<ReturnType<typeof getLeadDetail>>> }) {
  const email = d.contacts.find((c) => c.type === "email" && !c.isPersonal) ?? d.contacts.find((c) => c.type === "email");
  const phone = d.contacts.find((c) => c.type === "phone");
  return (
    <div>
      <PanelTitle
        action={
          <Button variant="outline" size="xs" asChild>
            <Link href={`/leads/${d.lead.id}`}>열기</Link>
          </Button>
        }
      >
        {d.lead.name}
      </PanelTitle>
      <div className="mb-3 flex gap-1.5">
        <StatusBadge status={d.lead.status} />
        <TierBadge tier={d.lead.tier} override={d.lead.tierOverride} />
      </div>
      <Field label="주소">{d.lead.address ?? "—"}</Field>
      <Field label="이메일">{email ? <span className={email.isPersonal ? "text-muted-foreground" : ""}>{email.value}{email.isPersonal && " (개인 추정)"}</span> : d.lead.emailManualCheck ? <span className="text-destructive">수동 확인 필요</span> : "없음 · 전화 우선"}</Field>
      <Field label="전화">{phone?.value ?? "—"}</Field>
      <Field label="홈페이지">{d.lead.homepage ? <a className="text-primary hover:underline" href={d.lead.homepage} target="_blank">{d.lead.homepage.replace(/^https?:\/\//, "").slice(0, 28)}</a> : "없음"}</Field>
      <div className="my-3 border-t" />
      <PanelTitle>진단 점수</PanelTitle>
      {d.audit?.scores ? (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          {(["place", "site", "geo"] as const).map((k) => (
            <div key={k} className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground">{{ place: "플레이스", site: "홈페이지", geo: "GEO" }[k]}</div>
              <div className="text-lg font-semibold tabular text-heading">{d.audit!.scores![k] ?? "—"}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-3 text-[13px] text-muted-foreground">진단 전</div>
      )}
      {d.audit?.topFixes.length ? (
        <ol className="mb-3 list-decimal pl-4 text-[13px]">
          {d.audit.topFixes.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      ) : null}
      <div className="my-3 border-t" />
      <PanelTitle>최근 활동</PanelTitle>
      {d.events.length === 0 && <div className="text-[13px] text-muted-foreground">없음</div>}
      {d.events.slice(0, 6).map((e) => (
        <div key={e.id} className="mb-1.5 flex justify-between text-[13px]">
          <span>{EVENT_LABEL[e.type] ?? e.type}{typeof e.payload.link === "string" && ` · ${e.payload.link}`}</span>
          <span className="text-muted-foreground">{fmtRel(e.occurredAt)}</span>
        </div>
      ))}
    </div>
  );
}

