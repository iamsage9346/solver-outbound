# 솔버 아웃리치 (solver-outbound)

병의원 GEO 아웃리치 자동화. 요구사항은 `병의원 GEO 아웃리치 자동화 PRD.md`, 작업 규칙은 `CLAUDE.md`.

## 시작하기
```bash
pnpm install
cp .env.example .env            # 키는 나중에 채워도 됨 (DRY_RUN=true 기본)
pnpm db:up                      # Docker Postgres (localhost:5433)
pnpm db:migrate && pnpm db:seed # 스키마 + 템플릿 5종 + 1차 캠페인
pnpm dev                        # http://localhost:3000
pnpm worker                     # pg-boss 워커 (60초 Gmail 폴링, 09시 팔로업, 발송 슬롯)
```

## 1차 라운드 CLI (PRD 13절 Phase 0~2)
```bash
pnpm cli list --sido 서울 --sggu 강남구     # 심평원 API 리스트업 + Tier
pnpm cli import data/samples/leads.sample.csv   # 구글시트 CSV → ykiho 병합
pnpm cli place data/samples/place.sample.json   # 강우 플레이스 데이터
pnpm cli crawl                              # 홈페이지 크롤 (이메일·문의폼·요약·수집거부 감지)
pnpm cli audit                              # 3축 진단 + 리포트 HTML(+PDF) + 랜딩 링크
pnpm cli approve all --by 상화               # 금지어 없는 리포트 승인 → 발송 큐
pnpm cli preview <leadId>                   # 메일 초안
pnpm cli send --test me@solver.kr           # 테스트 발송 (실발송 전 필수)
pnpm cli send --go                          # 화~목 10시 슬롯 · 상한 · 멱등
pnpm cli poll | followup | digest | weekly | status
```

## 실제 연결에 필요한 키 (.env)
- `HIRA_API_KEY` 심평원 (data.go.kr) · `ANTHROPIC_API_KEY` (요약·첫문장·회신분류) · GEO 엔진 키 3종
- `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GMAIL_SENDER` · `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_SIGNING_SECRET`
- `BOOKING_URL` (Google Calendar 예약 페이지) · `TALLY_SIGNING_SECRET`
- PDF 첨부가 필요하면 `pnpm add -w playwright && npx playwright install chromium`

## 인바운드 엔드포인트
- `POST /api/inbound/form` Tally 웹훅 또는 JSON 폼 → 리드 생성/병합 + Slack
- `POST /api/inbound/booking` 예약 확정 → 미팅 상태 + 리마인드 태스크 + Slack
- `POST /api/slack/actions` Slack 버튼
- `GET /r/{token}?to=report|booking|unsubscribe` 추적 링크 · `GET /report/{token}` 리포트 랜딩
