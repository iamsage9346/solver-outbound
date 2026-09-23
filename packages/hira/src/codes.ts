/** 심평원(HIRA) 코드 테이블. 시도 코드는 opendata.hira.or.kr 코드조회 기준. */
export const SIDO_CODES: Record<string, string> = {
  서울특별시: "110000",
  부산광역시: "210000",
  인천광역시: "220000",
  대구광역시: "230000",
  광주광역시: "240000",
  대전광역시: "250000",
  울산광역시: "260000",
  세종특별자치시: "410000",
  경기도: "310000",
  강원특별자치도: "320000",
  충청북도: "330000",
  충청남도: "340000",
  전북특별자치도: "350000",
  전라남도: "360000",
  경상북도: "370000",
  경상남도: "380000",
  제주특별자치도: "390000",
};

export const SIDO_ALIASES: Record<string, string> = {
  서울: "서울특별시",
  경기: "경기도",
  인천: "인천광역시",
  부산: "부산광역시",
  대구: "대구광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

export function resolveSido(input: string): { name: string; code: string } | null {
  const name = SIDO_CODES[input] ? input : SIDO_ALIASES[input];
  if (!name) return null;
  return { name, code: SIDO_CODES[name]! };
}

/** 종별코드 */
export const CL_CODES: Record<string, string> = {
  "01": "상급종합",
  "11": "종합병원",
  "21": "병원",
  "28": "요양병원",
  "29": "정신병원",
  "31": "의원",
  "41": "치과병원",
  "51": "치과의원",
  "71": "조산원",
  "72": "보건소",
  "92": "한방병원",
  "93": "한의원",
};

/** 진료과목 코드 (dgsbjtCd) — 일부 */
export const DGSBJT_CODES: Record<string, string> = {
  "01": "내과",
  "02": "신경과",
  "03": "정신건강의학과",
  "04": "외과",
  "05": "정형외과",
  "06": "신경외과",
  "07": "심장혈관흉부외과",
  "08": "성형외과",
  "09": "마취통증의학과",
  "10": "산부인과",
  "11": "소아청소년과",
  "12": "안과",
  "13": "이비인후과",
  "14": "피부과",
  "15": "비뇨의학과",
  "16": "영상의학과",
  "21": "재활의학과",
  "23": "가정의학과",
};
export const DGSBJT_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(DGSBJT_CODES).map(([k, v]) => [v, k]));
