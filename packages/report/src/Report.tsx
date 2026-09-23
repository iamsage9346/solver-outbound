import React from "react";
import type { ReportData } from "./types";

/** PRD 6절·9절: A4 1장, 흑백 + 포인트 1색(#2563EB), 얇은 보더. 같은 컴포넌트를 PDF·랜딩에 사용 */
const T = {
  border: "1px solid #E5E7EB",
  title: "#111827",
  body: "#374151",
  muted: "#6B7280",
  accent: "#2563EB",
};

const Score = ({ label, value }: { label: string; value: number | null }) => (
  <div style={{ flex: 1, border: T.border, borderRadius: 6, padding: "12px 16px" }}>
    <div style={{ fontSize: 12, color: T.muted }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 600, color: value == null ? T.muted : T.title, fontVariantNumeric: "tabular-nums" }}>
      {value == null ? "—" : value}
      <span style={{ fontSize: 12, color: T.muted, fontWeight: 400 }}> /100</span>
    </div>
  </div>
);

const Check = ({ ok, label }: { ok: boolean; label: string }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: T.body }}>
    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, border: `1.5px solid ${ok ? T.accent : "#D1D5DB"}`, background: ok ? T.accent : "transparent" }} />
    {label}
  </div>
);

const H = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: T.title, margin: "16px 0 6px" }}>{children}</div>
);

const th: React.CSSProperties = { textAlign: "left", fontSize: 11, color: T.muted, fontWeight: 500, padding: "4px 8px", borderBottom: T.border };
const td: React.CSSProperties = { fontSize: 12, color: T.body, padding: "5px 8px", borderBottom: T.border, fontVariantNumeric: "tabular-nums" };

export function Report({ d }: { d: ReportData }) {
  return (
    <div style={{ width: 794, minHeight: 1123, padding: "40px 44px", boxSizing: "border-box", background: "#fff", color: T.body, fontFamily: "Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", fontSize: 13, lineHeight: 1.45 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2px solid ${T.title}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: T.muted }}>네이버플레이스 · 홈페이지 · AI 검색(GEO) 진단</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.title }}>{d.hospitalName}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{d.region}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: T.muted }}>
          진단일 {d.auditedAt}
          <br />
          솔버 SOLVER
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Score label="플레이스" value={d.scores.place} />
        <Score label="홈페이지" value={d.scores.site} />
        <Score label="AI 검색 (GEO)" value={d.scores.geo} />
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <H>키워드별 플레이스 순위</H>
          {d.place ? (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>키워드</th>
                    <th style={{ ...th, textAlign: "right" }}>순위</th>
                  </tr>
                </thead>
                <tbody>
                  {d.place.keywords.map((k) => (
                    <tr key={k.keyword}>
                      <td style={td}>{k.keyword}</td>
                      <td style={{ ...td, textAlign: "right", color: k.rank != null && k.rank <= 10 ? T.title : T.muted }}>{k.rank == null ? "10위 밖" : `${k.rank}위`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                리뷰 {d.place.reviewCnt ?? "—"}개 · 최근 리뷰 {d.place.lastReviewAt ?? "—"}
                {d.place.missing.length > 0 && <> · 누락: {d.place.missing.join(", ")}</>}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: T.muted }}>플레이스 데이터가 이번 진단에서 제외되었습니다.</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <H>홈페이지 6개 항목</H>
          {d.site ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
              <Check ok={d.site.https} label="HTTPS 적용" />
              <Check ok={d.site.mobile} label="모바일 대응" />
              <Check ok={d.site.ttfbMs != null && d.site.ttfbMs < 1500} label={`응답 ${d.site.ttfbMs != null ? `${d.site.ttfbMs}ms` : "—"}`} />
              <Check ok={d.site.doctorsPage} label="의료진 페이지" />
              <Check ok={d.site.hoursPage} label="진료시간 페이지" />
              <Check ok={d.site.schemaOrg} label="구조화 데이터" />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.muted }}>홈페이지가 없거나 접근할 수 없었습니다.</div>
          )}
        </div>
      </div>

      <H>AI 검색 질문별 언급 {d.geo && <span style={{ color: T.accent, fontWeight: 600 }}>{d.geo.questionCnt}개 중 {d.geo.mentionedCnt}개 언급</span>}</H>
      {d.geo ? (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>질문</th>
                <th style={th}>언급</th>
                <th style={th}>언급한 엔진</th>
              </tr>
            </thead>
            <tbody>
              {d.geo.questions.slice(0, 8).map((q) => (
                <tr key={q.query}>
                  <td style={td}>{q.query}</td>
                  <td style={{ ...td, color: q.mentioned ? T.accent : T.muted }}>{q.mentioned ? "●" : "○"}</td>
                  <td style={{ ...td, color: T.muted }}>{q.engines.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.geo.failedEngines.length > 0 && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>제외된 엔진: {d.geo.failedEngines.join(", ")} (측정 실패)</div>}
        </>
      ) : (
        <div style={{ fontSize: 12, color: T.muted }}>AI 검색 측정이 이번 진단에서 제외되었습니다.</div>
      )}

      <H>같은 지역 병원 비교</H>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>병원</th>
            <th style={{ ...th, textAlign: "right" }}>플레이스</th>
            <th style={{ ...th, textAlign: "right" }}>리뷰</th>
            <th style={{ ...th, textAlign: "right" }}>AI 언급</th>
          </tr>
        </thead>
        <tbody>
          {[{ name: d.hospitalName, placeRank: d.place?.keywords[0]?.rank ?? null, reviewCnt: d.place?.reviewCnt ?? null, geoMentions: d.geo?.mentionedCnt ?? 0, self: true }, ...d.competitors.slice(0, 3)].map((c, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: "self" in c && c.self ? 600 : 400, color: "self" in c && c.self ? T.accent : T.body }}>{c.name}</td>
              <td style={{ ...td, textAlign: "right" }}>{c.placeRank == null ? "—" : `${c.placeRank}위`}</td>
              <td style={{ ...td, textAlign: "right" }}>{c.reviewCnt ?? "—"}</td>
              <td style={{ ...td, textAlign: "right" }}>{c.geoMentions}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H>바로 손볼 3가지</H>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {d.topFixes.map((f, i) => (
          <li key={i} style={{ fontSize: 13, color: T.title, marginBottom: 4 }}>
            {f}
          </li>
        ))}
      </ol>

      <div style={{ marginTop: 22, border: `1px solid ${T.accent}`, borderRadius: 6, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.title }}>30분 미팅에서 화면으로 설명드립니다</div>
          <div style={{ fontSize: 11, color: T.muted }}>{d.sender.name} · {d.sender.contact}</div>
        </div>
        <a href={d.bookingUrl} style={{ fontSize: 12, color: "#fff", background: T.accent, padding: "8px 14px", borderRadius: 6, textDecoration: "none" }}>
          미팅 시간 고르기
        </a>
      </div>
      <div style={{ fontSize: 10, color: T.muted, marginTop: 10 }}>본 리포트는 진단 시점의 공개 데이터 기준이며, 노출 순위나 결과를 보장하지 않습니다.</div>
    </div>
  );
}
