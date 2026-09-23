import { BANNED_TERMS } from "@solver/shared";
import { Toolbar, ThreePane, PanelTitle, Field } from "@/components/shell/page";
import { listSuppressions } from "@/lib/queries";
import { ctx } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = ctx.settings;
  const sup = await listSuppressions();
  const env = (k: string) => (process.env[k] ? "설정됨" : "없음");
  return (
    <>
      <Toolbar title="설정" subtitle="값은 packages/shared/src/settings.ts · .env 에서 바꿉니다" />
      <ThreePane
        left={
          <div className="text-[13px]">
            <PanelTitle>메뉴</PanelTitle>
            {["발송 계정·상한·슬롯", "Slack", "억제 목록", "Tier 규칙", "GEO 엔진·비용 상한", "금지어", "API 키"].map((m) => (
              <div key={m} className="mb-1 rounded-md px-2 py-1.5 text-muted-foreground">
                {m}
              </div>
            ))}
          </div>
        }
        center={
          <div className="mx-auto max-w-[720px] p-6">
            <Section title="발송">
              <Field label="계정">{process.env.GMAIL_SENDER ?? "—"} · Gmail OAuth {env("GOOGLE_REFRESH_TOKEN")}</Field>
              <Field label="상한">일 {s.send.dailyCap} · 시간 {s.send.hourlyCap} · 병원당 {s.send.perLeadCap}</Field>
              <Field label="슬롯">화·수·목 {s.send.time} ±{s.send.jitterMinutes}분</Field>
              <Field label="(광고) 표기">{s.send.adLabel ? "ON (법무 확인 전 기본)" : "OFF"}</Field>
              <Field label="모드">{ctx.dryRun ? "DRY_RUN (외부 호출 없음)" : "실발송"}</Field>
            </Section>
            <Section title="팔로업">
              <Field label="D+{n}">전화 D+{s.followup.callAfterDays} · 재메일 D+{s.followup.remailAfterDays} · 재접근 D+{s.followup.reapproachAfterDays}</Field>
              <Field label="요약">일일 {s.followup.dailyDigestTime} · 오픈 묶음 {s.followup.openDigestTimes.join(", ")}</Field>
            </Section>
            <Section title="Slack">
              <Field label="Bot 토큰">{env("SLACK_BOT_TOKEN")}</Field>
              <Field label="채널">{process.env.SLACK_CHANNEL_ID ?? "#outreach (미설정)"}</Field>
              <Field label="담당 DM">{process.env.SLACK_OWNER_USER_ID ?? "없음"}</Field>
            </Section>
            <Section title="Tier 규칙">
              <Field label="Tier 2">개원 {s.tier.t2.minYears}~{s.tier.t2.maxYears}년 · 의사 {s.tier.t2.minDoctors}~{s.tier.t2.maxDoctors} · 직원 {s.tier.t2.minStaffEst}+ (추정)</Field>
              <Field label="Tier 3">플레이스 {s.tier.t3.placeRankWorseThan}위 밖 · 리뷰 {s.tier.t3.reviewLessThan} 미만 · 홈페이지 없음</Field>
              <Field label="제외">{s.tier.exclude.excludedSggu.join(", ")} · 종합병원 이상 · 개원 {s.tier.exclude.minYears}년 미만</Field>
            </Section>
            <Section title="GEO">
              <Field label="엔진">{s.geo.engines.join(", ")} · 반복 {s.geo.repeats}회</Field>
              <Field label="가중치">언급률 {s.geo.weights.mentionRate} · 자사 출처 {s.geo.weights.ownSource} · 순서 {s.geo.weights.position}</Field>
              <Field label="비용 상한">₩{s.geo.costCapKrw.toLocaleString()} / 라운드</Field>
              <Field label="API 키">Anthropic {env("ANTHROPIC_API_KEY")} · OpenAI {env("OPENAI_API_KEY")} · Perplexity {env("PERPLEXITY_API_KEY")} · Gemini {env("GEMINI_API_KEY")} · 심평원 {env("HIRA_API_KEY")}</Field>
            </Section>
            <Section title="금지어">
              <div className="flex flex-wrap gap-1">
                {BANNED_TERMS.map((t) => (
                  <span key={t} className="status-badge border-border text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
            </Section>
            <Section title={`억제 목록 (${sup.length}) · 삭제 불가`}>
              {sup.length === 0 && <div className="text-[13px] text-muted-foreground">없음</div>}
              {sup.map((r) => (
                <div key={r.id} className="flex justify-between border-b py-1.5 text-[13px]">
                  <span className="truncate font-mono text-xs">{r.value}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.kind} · {r.reason} · {fmtDate(r.createdAt)}
                  </span>
                </div>
              ))}
            </Section>
          </div>
        }
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-md border p-4">
      <div className="mb-3 text-[13px] font-semibold text-heading">{title}</div>
      {children}
    </section>
  );
}
