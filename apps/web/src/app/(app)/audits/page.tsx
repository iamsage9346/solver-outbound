import Link from "next/link";
import { Report, type ReportData } from "@solver/report";
import { Toolbar, ThreePane, PanelTitle } from "@/components/shell/page";
import { AuditActions, DeviceToggle } from "@/components/audits/actions";
import { listAudits } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditsPage({ searchParams }: PageProps<"/audits">) {
  const sp = await searchParams;
  const rows = await listAudits();
  const selId = typeof sp.a === "string" ? sp.a : rows[0]?.audit.id;
  const sel = rows.find((r) => r.audit.id === selId) ?? null;
  const data = (sel?.audit.reportData as ReportData | null) ?? null;
  const approved = rows.filter((r) => r.audit.approvedAt).length;

  return (
    <>
      <Toolbar title="진단" subtitle={`${rows.length}건 · 승인 ${approved}`} />
      <ThreePane
        left={
          <div>
            <PanelTitle>병원 · 진단 상태</PanelTitle>
            {rows.length === 0 && <div className="text-[13px] text-muted-foreground">진단 결과가 없습니다. `pnpm cli audit`로 생성하세요.</div>}
            {rows.map(({ audit: a, lead: l }) => (
              <Link key={a.id} href={`/audits?a=${a.id}`} className={cn("mb-1 block rounded-md border px-2.5 py-2 hover:bg-muted", a.id === selId && "border-primary")}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-heading">{l.name}</span>
                  <span className={cn("text-xs", a.approvedAt ? "text-primary" : a.bannedTerms.length ? "text-destructive" : "text-muted-foreground")}>{a.approvedAt ? "승인" : a.bannedTerms.length ? "금지어" : "검수 대기"}</span>
                </div>
                <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground tabular">
                  <span>P {a.scores?.place ?? "—"}</span>
                  <span>S {a.scores?.site ?? "—"}</span>
                  <span>G {a.scores?.geo ?? "—"}</span>
                  <span className="ml-auto">{fmtDate(a.auditedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        }
        center={data ? <DeviceToggle><Report d={data} /></DeviceToggle> : <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">리포트를 선택하세요. 이전 버전 진단은 재실행하면 미리보기가 생깁니다.</div>}
        right={sel ? <AuditActions auditId={sel.audit.id} leadId={sel.lead.id} approved={!!sel.audit.approvedAt} banned={sel.audit.bannedTerms} topFixes={sel.audit.topFixes} /> : undefined}
      />
    </>
  );
}
