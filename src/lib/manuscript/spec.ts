/**
 * 원고지 규격.
 *
 * 기본값은 연세대 2027 인문계열 답안지 실측치다.
 * 첫 줄은 왼쪽 3칸을 문항 번호 라벨이 차지해 35칸, 둘째 줄부터 38칸.
 */
export interface ManuscriptSpec {
  /** 한 줄 칸 수 */
  cols: number;
  /** 첫 줄에서 문항 번호 라벨이 차지하는 칸 수 */
  labelCells: number;
  /** 우측 누적 글자 수 눈금 간격 (줄 단위) */
  tickEvery: number;
  /** 허용 상한을 채우고도 남길 여유 줄 수 */
  extraLines: number;
}

export const DEFAULT_SPEC: ManuscriptSpec = {
  cols: 38,
  labelCells: 3,
  tickEvery: 4,
  extraLines: 2,
};

/**
 * 문항이 요구하는 분량.
 *
 * 대개 "600자 내외" 처럼 목표만 적혀 있어 tolerance(기본 ±10%)로 범위를 잡는다.
 * 그런데 문제지가 "(800±100자)" 나 "500자 이상 600자 이하" 처럼 범위를 못 박기도 한다.
 * 그때는 min · max 를 그대로 쓴다 — 비율로 환산하면 문제지와 다른 수가 나온다.
 */
export interface LengthRule {
  target: number;
  tolerance: number;
  /** 문제지가 정한 하한 · 상한. 없으면 target 과 tolerance 로 계산한다. */
  min?: number | null;
  max?: number | null;
}

export const DEFAULT_TOLERANCE = 0.1;

export interface LengthRange {
  min: number;
  target: number;
  max: number;
}

export function lengthRange(rule: LengthRule): LengthRange {
  // 허용 폭을 먼저 정수로 만든다.
  // target * (1 + 0.1) 로 곱하면 400 이 440.00000000000006 이 되어 상한이 441 로 밀린다.
  const delta = Math.round(rule.target * rule.tolerance);

  return {
    min: rule.min ?? rule.target - delta,
    target: rule.target,
    max: rule.max ?? rule.target + delta,
  };
}

/** row 번째 줄이 실제로 쓸 수 있는 칸 수 */
export function rowCapacity(spec: ManuscriptSpec, row: number): number {
  return row === 0 ? spec.cols - spec.labelCells : spec.cols;
}

/** row 번째 줄 끝까지의 누적 칸 수 */
export function cumulativeThrough(spec: ManuscriptSpec, row: number): number {
  if (row < 0) return 0;
  return rowCapacity(spec, 0) + spec.cols * row;
}

/** n번째 칸(1-based)이 놓이는 위치 */
export function positionOf(spec: ManuscriptSpec, n: number): { row: number; col: number } {
  const first = rowCapacity(spec, 0);
  if (n <= first) return { row: 0, col: n - 1 };
  const rest = n - first - 1;
  return { row: 1 + Math.floor(rest / spec.cols), col: rest % spec.cols };
}

/** 허용 상한 + 여유 줄까지 담을 줄 수 */
export function planRows(spec: ManuscriptSpec, rule: LengthRule): number {
  const { max } = lengthRange(rule);
  const first = rowCapacity(spec, 0);
  const needed = max <= first ? 1 : 1 + Math.ceil((max - first) / spec.cols);
  return needed + spec.extraLines;
}
