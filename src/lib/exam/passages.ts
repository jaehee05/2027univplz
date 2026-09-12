import type { Passage } from "@/lib/types/exam";

/**
 * 제시문을 한 번씩만 남긴다.
 *
 * 제시문은 문항마다 복사해 둔다 — 여러 문항이 같은 (가)~(라)를 함께 쓰기 때문이다.
 * 그대로 늘어놓으면 화면과 인쇄물에서 같은 제시문이 문항 수만큼 되풀이된다.
 * 기호와 앞부분이 같으면 같은 제시문으로 본다.
 */
export function mergePassages(lists: (Passage[] | undefined)[]): Passage[] {
  const seen = new Map<string, Passage>();
  for (const list of lists) {
    for (const passage of list ?? []) {
      const key = `${passage.label}|${passage.text.slice(0, 200)}`;
      if (!seen.has(key)) seen.set(key, passage);
    }
  }
  return [...seen.values()];
}
