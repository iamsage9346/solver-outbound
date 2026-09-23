/**
 * 심평원 홈페이지 URL이 없거나 죽은 링크일 때 네이버 검색 결과의 공식 홈페이지를 찾는다.
 * TODO(2차): 네이버 검색 API 또는 Playwright 어댑터로 구현. 지금은 항상 null을 반환하고
 * CLI는 리드에 "홈페이지 수동 확인"을 남긴다.
 */
export async function guessHomepageFromNaver(_name: string, _address: string | null | undefined): Promise<string | null> {
  return null;
}
