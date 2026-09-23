import "@solver/shared/node";
import { createDb } from "./client";
import { campaigns, contacts, leads, settings, templates } from "./schema";
import { DEFAULT_SETTINGS, extractVariables } from "@solver/shared";
import { sql } from "drizzle-orm";

const db = createDb();

/** PRD 7절 템플릿 5종. 본문은 3문장 구조(원장님 병원 얘기 → 우리 소개 → 30분 요청) */
const TEMPLATES = [
  {
    key: "cold_geo",
    name: "사전 진단 콜드메일",
    subject: "{병원명} 네이버플레이스·AI 검색 진단 결과 1장 공유드립니다",
    bodyMd: `{병원명} 원장님께,

{첫문장}

"{지역} 정형외과"로 검색했을 때 {병원명}은 플레이스 {플레이스순위}위이고, AI 검색(ChatGPT·Perplexity 등)에 지역 질문 {GEO질문수}개를 넣었을 때 {GEO언급수}번 언급됐습니다. 현재 상태와 바로 손볼 3가지를 1장 리포트로 정리했습니다.
→ {리포트링크}

저희는 솔버라는 팀이고, 병의원의 검색 노출 구조와 원내 자동화를 만듭니다. 이 메일과 리포트도 저희가 실제로 쓰는 자동화로 만들어졌습니다.

30분만 내주시면 리포트 내용을 화면으로 설명드리겠습니다. 편한 시간을 골라주세요.
→ {예약링크}

{발신자명} 드림
{발신자연락처}

이 메일을 더 받고 싶지 않으시면 이 메일에 "수신거부"라고 회신하시거나 아래 링크를 눌러주세요. {수신거부링크}`,
  },
  {
    key: "referral",
    name: "소개 메일",
    subject: "{소개자} 원장님 소개로 연락드립니다 — {병원명} 검색 진단 1장",
    bodyMd: `{병원명} 원장님께,

{소개자} 원장님 소개로 연락드립니다. {소개자병원에서한일}

{병원명}의 플레이스·AI 검색 현황을 1장으로 정리했습니다.
→ {리포트링크}

30분 미팅이 가능하시면 편한 시간을 골라주세요.
→ {예약링크}

{발신자명} 드림
{발신자연락처}

수신을 원치 않으시면 "수신거부"라고 회신해 주세요. {수신거부링크}`,
  },
  {
    key: "d7_remail",
    name: "D+7 재메일",
    subject: "Re: {병원명} 진단 — {개선포인트1}",
    bodyMd: `{병원명} 원장님께,

지난주 보내드린 진단에서 한 가지만 다시 짚어드립니다.

{개선포인트1}

같은 지역의 {경쟁병원1}은 이 항목이 채워져 있어 AI 검색 답변에 먼저 등장합니다. 리포트 다시 보기 → {리포트링크}

30분 미팅이 가능하시면 → {예약링크}

{발신자명} 드림
{발신자연락처}

수신을 원치 않으시면 "수신거부"라고 회신해 주세요. {수신거부링크}`,
  },
  {
    key: "reapproach",
    name: "2주 후 재접근 (AI 교육 훅)",
    subject: "{병원명} 원내 AI 활용 30분 세션 제안",
    bodyMd: `{병원명} 원장님께,

검색 진단 건과 별개로, 원내 직원 대상 AI 활용 교육 30분 세션을 제안드립니다.

가능하시면 → {예약링크}

{발신자명} 드림
{발신자연락처}

수신을 원치 않으시면 "수신거부"라고 회신해 주세요. {수신거부링크}`,
  },
  {
    key: "booking_confirm",
    name: "예약 확인",
    subject: "[솔버] {미팅일시} 미팅 확정되었습니다",
    bodyMd: `{병원명} 원장님, {미팅일시} 30분 미팅이 확정되었습니다.

전날 리마인드를 한 번 더 보내드리겠습니다. 소개 링크: {소개링크}

{발신자명} 드림
{발신자연락처}`,
  },
];

async function main() {
  for (const t of TEMPLATES) {
    const variables = extractVariables(t.subject + "\n" + t.bodyMd);
    await db
      .insert(templates)
      .values({ ...t, variables })
      .onConflictDoUpdate({ target: templates.key, set: { subject: t.subject, bodyMd: t.bodyMd, variables, version: sql`${templates.version} + 1` } });
  }

  const [round1] = await db
    .insert(campaigns)
    .values({ name: "1차 라운드 · 정형외과 수도권 (9/29)", hook: "GEO", startsAt: new Date("2026-09-29T01:00:00Z") })
    .onConflictDoNothing()
    .returning();

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }

  if (process.env.SEED_SAMPLE === "1") {
    const sample = [
      { ykiho: "SAMPLE0001", name: "강남정형외과의원", sido: "서울특별시", sggu: "강남구", emd: "역삼동", clCd: "31", clName: "의원", estDate: "2021-03-15", doctorCnt: 3, staffEst: 12, tier: "T2" as const, homepage: "https://example.com", placeRank: 7, reviewCnt: 112 },
      { ykiho: "SAMPLE0002", name: "서초튼튼정형외과", sido: "서울특별시", sggu: "서초구", emd: "서초동", clCd: "31", clName: "의원", estDate: "2019-11-01", doctorCnt: 2, staffEst: 9, tier: "T3" as const, homepage: null, placeRank: 14, reviewCnt: 21 },
      { ykiho: "SAMPLE0003", name: "분당연세정형외과", sido: "경기도", sggu: "성남시 분당구", emd: "정자동", clCd: "31", clName: "의원", estDate: "2022-06-20", doctorCnt: 4, staffEst: 15, tier: "T2" as const, homepage: "https://example.org", placeRank: 3, reviewCnt: 260 },
    ];
    for (const s of sample) {
      const [l] = await db.insert(leads).values({ ...s, address: `${s.sido} ${s.sggu} ${s.emd}`, deptTags: ["정형외과"] }).onConflictDoNothing().returning();
      if (l) {
        await db.insert(contacts).values({ leadId: l.id, type: "phone", value: "02-000-0000", source: "hira", confidence: 1, isPrimary: true }).onConflictDoNothing();
        if (s.ykiho !== "SAMPLE0002")
          await db.insert(contacts).values({ leadId: l.id, type: "email", value: `info@${s.ykiho.toLowerCase()}.co.kr`, source: "crawl", confidence: 0.7, role: "general" }).onConflictDoNothing();
      }
    }
  }

  console.log("seeded", { templates: TEMPLATES.length, campaign: round1?.name ?? "(exists)" });
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
