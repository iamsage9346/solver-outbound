/**
 * Gmail·Calendar OAuth 리프레시 토큰 발급기.
 *   pnpm google:auth
 * .env의 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (데스크톱 앱 유형)을 읽어 브라우저 승인 URL을 띄우고,
 * 로컬 콜백(http://localhost:53682/callback)으로 돌아온 코드를 토큰으로 바꿔 .env의 GOOGLE_REFRESH_TOKEN에 기록한다.
 */
import "@solver/shared/node";
import { google } from "googleapis";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/calendar.events.readonly"];
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;
const ENV_PATH = new URL("../.env", import.meta.url).pathname;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(".env에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET을 먼저 넣으세요 (Google Cloud → OAuth 클라이언트, 유형 '데스크톱 앱').");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
const url = oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", REDIRECT);
  if (u.pathname !== "/callback") return res.end("waiting");
  const code = u.searchParams.get("code");
  if (!code) {
    res.end("코드가 없습니다: " + (u.searchParams.get("error") ?? ""));
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) throw new Error("refresh_token이 없습니다. Google 계정 보안 → 서드파티 액세스에서 이 앱을 제거한 뒤 다시 실행하세요.");
    let env = readFileSync(ENV_PATH, "utf8");
    env = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(env) ? env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`) : env + `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    writeFileSync(ENV_PATH, env);
    oauth2.setCredentials(tokens);
    const me = await google.gmail({ version: "v1", auth: oauth2 }).users.getProfile({ userId: "me" });
    const sender = me.data.emailAddress ?? "";
    if (sender && !/^GMAIL_SENDER=.+$/m.test(env)) writeFileSync(ENV_PATH, env.replace(/^GMAIL_SENDER=.*$/m, `GMAIL_SENDER=${sender}`));
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<h2>완료</h2><p>${sender} 계정의 리프레시 토큰을 .env에 저장했습니다. 이 창을 닫으세요.</p>`);
    console.log(`✓ GOOGLE_REFRESH_TOKEN 저장 · 발송 계정 ${sender}`);
  } catch (e) {
    res.end("실패: " + (e as Error).message);
    console.error(e);
  } finally {
    setTimeout(() => process.exit(0), 300);
  }
});
server.listen(PORT, () => {
  console.log("브라우저에서 아래 URL을 열어 솔버 Workspace 계정으로 승인하세요:\n\n" + url + "\n");
  try {
    execSync(`open "${url}"`);
  } catch {}
});
