import Link from "next/link";
import { KR_HOLIDAYS_2026, nextSendSlot } from "@solver/mailer";
import { Toolbar, ThreePane, PanelTitle, Field } from "@/components/shell/page";
import { QueuePanel } from "@/components/campaigns/queue";
import { listQueue, listSentStats, listTemplates } from "@/lib/queries";
import { ctx } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "queue";
  const [queue, templates, stats] = await Promise.all([listQueue(), listTemplates(), listSentStats()]);
  const leadId = typeof sp.lead === "string" ? sp.lead : queue.find((q) => q.lead.status === "queued")?.lead.id ?? null;
  const selLead = queue.find((q) => q.lead.id === leadId)?.lead ?? null;
  const tplKey = typeof sp.tpl === "string" ? sp.tpl : templates[0]?.key;
  const tpl = templates.find((t) => t.key === tplKey) ?? null;
  const slot = nextSendSlot(new Date(), { holidays: KR_HOLIDAYS_2026 });

  const Tab = ({ id, label }: { id: string; label: string }) => (
    <Link href={`/campaigns?tab=${id}${leadId ? `&lead=${leadId}` : ""}`} className={cn("border-b-2 px-3 py-2 text-[13px]", tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {label}
    </Link>
  );

  return (
    <>
      <Toolbar title="캠페인" subtitle="1차 라운드 · 정형외과 수도권" />
      <div className="flex h-10 items-center border-b px-2">
        <Tab id="templates" label="템플릿" />
        <Tab id="queue" label="발송 큐 · 승인" />
        <Tab id="stats" label="성과" />
      </div>
      {tab === "templates" && (
        <ThreePane
          left={
            <div>
              <PanelTitle>템플릿</PanelTitle>
              {templates.map((t) => (
                <Link key={t.id} href={`/campaigns?tab=templates&tpl=${t.key}`} className={cn("mb-1 block rounded-md border px-2.5 py-2 text-[13px] hover:bg-muted", t.key === tplKey && "border-primary")}>
                  <div className="font-medium text-heading">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.key} · v{t.version} · 변수 {t.variables.length}</div>
                </Link>
              ))}
              <div className="mt-3 text-xs text-muted-foreground">1차 라운드는 마크다운 템플릿 + 변수 치환만 제공합니다. 편집은 `packages/db/src/seed.ts`. 블록 에디터는 2차.</div>
            </div>
          }
          center={tpl ? <div className="mx-auto max-w-[680px] p-6"><div className="mb-3 text-[13px] text-muted-foreground">Subject</div><div className="mb-4 text-[15px] font-semibold text-heading">{tpl.subject}</div><pre className="whitespace-pre-wrap rounded-md border p-4 font-sans text-[14px] leading-relaxed">{tpl.bodyMd}</pre></div> : <div className="p-6 text-[13px] text-muted-foreground">템플릿이 없습니다. `pnpm db:seed`</div>}
          right={tpl ? <div><PanelTitle>변수</PanelTitle>{tpl.variables.map((v) => <div key={v} className="mb-1 rounded-md border px-2 py-1 font-mono text-xs">{`{${v}}`}</div>)}<div className="my-3 border-t" /><PanelTitle>발송 슬롯</PanelTitle><Field label="다음 슬롯">{fmtDate(slot, true)}</Field><Field label="요일">화·수·목 10:00 ±15분</Field><Field label="상한">일 {ctx.settings.send.dailyCap} · 시간 {ctx.settings.send.hourlyCap} · 병원당 {ctx.settings.send.perLeadCap}</Field><Field label="(광고) 표기">{ctx.settings.send.adLabel ? "ON" : "OFF"}</Field></div> : undefined}
        />
      )}
      {tab === "queue" && (
        <ThreePane
          left={
            <div>
              <PanelTitle>발송 큐</PanelTitle>
              {queue.length === 0 && <div className="text-[13px] text-muted-foreground">승인된 리드가 없습니다. 진단 화면에서 승인하세요.</div>}
              {queue.map(({ lead: l, audit: a, email }) => (
                <Link key={l.id} href={`/campaigns?tab=queue&lead=${l.id}`} className={cn("mb-1 block rounded-md border px-2.5 py-2 text-[13px] hover:bg-muted", l.id === leadId && "border-primary")}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-heading">{l.name}</span>
                    <span className={cn("text-xs", l.status === "queued" ? "text-primary" : "text-muted-foreground")}>{l.status === "queued" ? "승인됨" : "미승인"}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{email ?? (l.phoneFirst ? "이메일 없음 · 전화 우선" : "이메일 없음")}{a?.topFixes[0] && ` · ${a.topFixes[0]}`}</div>
                </Link>
              ))}
            </div>
          }
          center={<QueuePanel leadId={leadId} leadName={selLead?.name ?? null} hasTestSend={Number(stats.test) > 0} />}
          right={
            <div>
              <PanelTitle>발송 슬롯</PanelTitle>
              <Field label="다음 슬롯">{fmtDate(slot, true)}</Field>
              <Field label="오늘 발송">{Number(stats.sent)}통</Field>
              <Field label="테스트 발송">{Number(stats.test)}통</Field>
              <div className="my-3 border-t" />
              <PanelTitle>체크리스트</PanelTitle>
              <ul className="list-disc pl-4 text-[13px] text-muted-foreground">
                <li>SPF · DKIM · DMARC 확인</li>
                <li>"(광고)" 표기 법무 확인 (9/28)</li>
                <li>테스트 발송으로 변수·첨부 확인</li>
                <li>병원명·원장명 오기 0건</li>
              </ul>
              <div className="mt-3 text-xs text-muted-foreground">{ctx.dryRun ? "DRY_RUN=true · 실제 Gmail 호출 없음" : "실발송 모드"}</div>
            </div>
          }
        />
      )}
      {tab === "stats" && (
        <div className="p-6">
          <div className="grid max-w-[720px] grid-cols-6 gap-2">
            {[["발송", stats.sent], ["클릭", stats.clicks], ["회신", stats.replies], ["예약", stats.bookings], ["수신거부", stats.unsub], ["테스트", stats.test]].map(([k, v]) => (
              <div key={String(k)} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="text-xl font-semibold tabular text-heading">{Number(v)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-[13px] text-muted-foreground">채널별·소개 경로별 상세는 주간 현황(Slack, 월 09:00)과 Phase 3에서 확장합니다.</div>
        </div>
      )}
    </>
  );
}
