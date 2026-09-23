# 솔버 아웃리치 (solver-outbound)

병의원 GEO 아웃리치 자동화. 원본 요구사항은 `병의원 GEO 아웃리치 자동화 PRD.md` — 코드보다 PRD가 우선이며, 절 번호로 참조한다.

## 구조 (PRD 11절)
- `apps/web` Next.js 16 App Router 대시보드 (리드·진단·캠페인·인박스·태스크·설정). 9절 디자인 토큰은 `src/app/globals.css`.
- `apps/worker` pg-boss 잡: crawl, audit, send-slot, poll-gmail(60초), followup(09:00), digest.
- `packages/shared` enum·금지어·설정 기본값·템플릿 변수. `packages/db` Drizzle 스키마(10절)·마이그레이션.
- `packages/hira` 심평원 API + Tier 규칙(4절). `packages/crawler` 홈페이지 크롤(5절). `packages/geo` GEO 엔진·점수(6절).
- `packages/llm` Claude 작업(요약·첫문장·회신분류·답장초안). `packages/mailer` Gmail 발송·수신·바운스·슬롯(7절). `packages/notify` Slack(8절). `packages/report` 리포트 HTML/PDF.
- `packages/pipeline` 위 어댑터를 묶는 단계별 함수. CLI(`scripts/cli.ts`)와 워커·웹이 모두 이것만 호출한다.

## 실행
```
pnpm db:up && pnpm db:migrate && pnpm db:seed      # Postgres(도커 5433) + 스키마 + 템플릿
pnpm cli list --sido 서울 --sggu 강남구             # 1 리스트업
pnpm cli crawl / audit / approve all --by 상화      # 2 크롤 · 3 진단 · 승인
pnpm cli send --test me@x.com → pnpm cli send --go   # 4 발송 (테스트 후 실발송)
pnpm cli poll / followup / digest / status
pnpm dev (web :3000) · pnpm worker
```
`DRY_RUN=true`(기본)면 외부 호출 없이 전체 흐름이 돈다. 실발송·실크롤링은 `.env`에서 `DRY_RUN=false`.

## 반드시 지킬 규칙 (PRD 6·7·12절)
- 금지어 사전(`packages/shared/src/compliance.ts`): 순위 보장·상승·리뷰 유도·과장. 리포트·템플릿·LLM 출력 어디에도 넣지 않는다. 금지어가 있으면 승인 불가.
- 발송 상한: 일 40 · 시간 15 · 병원당 3. 화·수·목 10:00±15분만. 링크 3개 이하, 이미지 없음, 텍스트 위주.
- 변수 누락 시 발송 차단. 승인된 진단이 있는 리드만 큐에 들어간다. 테스트 발송 기록이 있어야 `--go`가 열린다.
- 수신거부·하드 바운스는 사람 확인 없이 즉시 억제 목록 + 시퀀스 중단. 억제 목록은 삭제하지 않는다.
- 이메일무단수집거부 문구가 있는 도메인은 이메일 자동 추출 금지 → `emailManualCheck`. 담당이 확인해 넣은 주소만 `source=manual`.
- 개인 추정 메일(`isPersonal`)은 기본 발송 제외. 수신거부 시 값은 해시로만 남긴다.
- "(광고)" 표기는 법무 확인 전까지 기본 ON (`settings.send.adLabel`).
- 모든 잡은 멱등. 같은 시퀀스 같은 단계는 unique 제약으로 두 번 나가지 않는다. 이벤트는 `dedupeKey`로 중복 알림을 막는다.
- 외부 호출은 전부 `packages/*` 어댑터를 거치고 드라이런 모드가 있어야 한다.

## 코드 규칙
- TypeScript strict, pnpm 워크스페이스, 패키지는 `src/index.ts`를 직접 export (빌드 없음).
- 발송·억제·수신거부 로직은 단위 테스트 필수 (`packages/mailer/test`, `packages/pipeline/test`).
- 웹은 서버 컴포넌트 + 서버 액션. `@solver/mailer`·`@solver/pipeline`은 서버 전용.
- 디자인: 흰 배경, `1px #E5E7EB` 보더, 포인트 `#2563EB` 하나, 그림자·그라데이션·색 배경 카드 없음, 프라이머리 버튼은 화면당 1개.
