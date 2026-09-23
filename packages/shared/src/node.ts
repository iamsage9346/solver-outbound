/** Node 전용 유틸. 클라이언트 번들에 섞이지 않도록 "@solver/shared/node"로만 가져온다. */
import { randomBytes } from "node:crypto";
export { loadEnv, REPO_ROOT } from "./env";

export function token(bytes = 12): string {
  return randomBytes(bytes).toString("base64url");
}
