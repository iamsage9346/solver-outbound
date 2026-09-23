import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** 레포 루트의 .env를 찾아 로드한다 (어느 패키지 cwd에서 실행해도 동일). */
export function loadEnv(from = process.cwd()): string | null {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const envPath = join(dir, ".env");
      if (existsSync(envPath)) config({ path: envPath, quiet: true });
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export const REPO_ROOT = loadEnv();
