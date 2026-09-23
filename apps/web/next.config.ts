import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 워크스페이스 패키지는 빌드 없이 소스를 직접 가져온다
  transpilePackages: ["@solver/shared", "@solver/db", "@solver/hira", "@solver/pipeline", "@solver/report", "@solver/notify", "@solver/llm", "@solver/mailer", "@solver/crawler", "@solver/geo"],
  serverExternalPackages: ["postgres", "googleapis", "playwright", "undici", "cheerio", "@slack/web-api", "@anthropic-ai/sdk", "openai", "pg-boss"],
};

export default nextConfig;
