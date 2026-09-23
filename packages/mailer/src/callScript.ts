export interface CallScriptVars {
  병원명: string;
  지역: string;
  플레이스순위?: number | string | null;
  개선포인트1?: string | null;
}

/** D+2 전화 태스크 스크립트 (3줄: 인사 · 메일 언급 · 30분 요청). 금지어 없음. */
export function buildCallScript(v: CallScriptVars): string {
  const rank = v.플레이스순위 != null && v.플레이스순위 !== "" ? `"${v.지역} 정형외과" 검색에서 ${v.플레이스순위}위로 나오는 현재 상태` : `${v.지역} 검색 노출 현재 상태`;
  const point = v.개선포인트1 ? ` 특히 "${v.개선포인트1}" 항목은 바로 손볼 수 있는 부분입니다.` : "";
  return [
    `안녕하세요, 솔버의 ○○○입니다. ${v.병원명} 원장님 또는 행정실장님과 잠깐 통화 가능할까요?`,
    `이틀 전에 ${v.병원명} 네이버플레이스·AI 검색 진단 1장을 메일로 보내드렸습니다. ${rank}와 바로 손볼 3가지를 정리한 자료입니다.${point}`,
    `내용을 화면으로 설명드리는 데 30분이면 됩니다. 이번 주나 다음 주 중 편하신 시간이 있으실까요? 없으시면 메일의 예약 링크로 골라주셔도 됩니다.`,
  ].join("\n");
}
