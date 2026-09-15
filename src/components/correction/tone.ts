import type { InlineComment } from "@/lib/types/work";
import { snapRange } from "@/lib/work/snap";

export type Severity = InlineComment["severity"];

/**
 * 코멘트 번호는 원문자(①) 대신 `1)` 로 적고, 형광펜 구간 **위**에 작게 띄운다.
 * 원고지 · 줄글 · 인쇄물이 모두 이 함수를 거쳐 같은 모양을 쓴다.
 */
export function markLabel(index: number): string {
  return `${index})`;
}

/**
 * 형광펜 칠. 실제 형광펜처럼 글자 아래쪽만 덮고 위는 비워 둔다 —
 * 그 빈 자리에 번호가 앉는다.
 *
 * `box-decoration-clone` 이 없으면 여러 줄에 걸친 구간이 한 덩어리 사각형이 되어
 * 뒷줄 글자를 덮어 버린다. 인라인 요소(`<mark>`)와 이 속성이 한 벌이다.
 */
export const HIGHLIGHT: Record<Severity, string> = {
  good: "bg-emerald-200/70 decoration-emerald-500",
  info: "bg-slate-200/70 decoration-slate-400",
  warning: "bg-amber-200/80 decoration-amber-500",
  error: "bg-rose-200/80 decoration-rose-500",
};

/** 번호 · 점 · 카드 테두리에 쓰는 진한 색 */
export const ACCENT: Record<Severity, string> = {
  good: "text-emerald-700",
  info: "text-slate-600",
  warning: "text-amber-700",
  error: "text-rose-700",
};

export const DOT: Record<Severity, string> = {
  good: "bg-emerald-500",
  info: "bg-slate-400",
  warning: "bg-amber-500",
  error: "bg-rose-500",
};

export const CARD: Record<Severity, string> = {
  good: "border-emerald-200 bg-emerald-50/60",
  info: "border-slate-200 bg-slate-50",
  warning: "border-amber-200 bg-amber-50/60",
  error: "border-rose-200 bg-rose-50/60",
};

/** 겹칠 때 더 센 쪽이 이긴다. */
export const WEIGHT: Record<Severity, number> = { info: 1, good: 2, warning: 3, error: 4 };

export const ORDER: Severity[] = ["error", "warning", "good", "info"];

/**
 * 답안 순서대로 1번부터 번호를 매긴다. 화면과 인쇄가 같은 번호를 쓴다.
 *
 * 매기기 전에 구간을 말이 되는 자리로 옮겨 붙인다(`snapRange`).
 * 저장할 때도 같은 일을 하지만, 그 장치가 생기기 전에 저장된 첨삭이 남아 있다 —
 * `표준어의` 한복판이나 `(다)` 의 여는 괄호 뒤에서 끊긴 것들이다.
 * 여기서 한 번 더 붙이면 옛 첨삭도 제대로 보인다. 이미 붙은 것은 그대로 지나간다.
 */
export function numbered<T extends { start: number; end: number }>(
  comments: T[],
  answerText: string,
): (T & { index: number })[] {
  return [...comments]
    .map((comment) => ({ ...comment, ...snapRange(answerText, comment.start, comment.end) }))
    .sort((a, b) => a.start - b.start)
    .map((comment, index) => ({ ...comment, index: index + 1 }));
}
