/**
 * 첨삭 코멘트가 가리키는 구간을 말이 되는 자리에서 끊는다.
 *
 * 모델이 돌려주는 위치는 곧잘 어중간한 데서 잘린다 — `…나뉜다. (가` 처럼
 * 문장 한복판이나 여는 괄호 뒤에서 끝나 버리면, 색칠한 자리가 무엇을 가리키는지
 * 읽는 쪽에서 알 수 없다.
 *
 * 그래서 받은 위치를 그대로 쓰지 않고 **가까운 경계로 옮겨 붙인다.**
 * 앞은 어절이나 문장 머리로 당기고, 뒤는 문장부호까지 민다.
 * 다만 멀리 끌고 가지는 않는다 — 코멘트가 가리키던 대목을 벗어나면 뜻이 달라진다.
 *
 * 비밀값을 다루지 않는 순수 함수라 단위 검증(`npm run check:snap`)에서 그대로 부른다.
 */

/** 문장을 끝내는 부호 */
const SENTENCE_END = /[.!?。．！？]/;
/** 절을 끊는 부호 — 문장 끝을 못 찾을 때 여기까지는 민다 */
const CLAUSE_END = /[,;:·…、，；]/;
/** 닫는 짝 — 구간 끝에 바로 붙어 있으면 함께 품는다 */
const CLOSERS = `)]}»›”’"'』」》〉．`;
/** 여는 짝 */
const OPENERS = `([{«‹“‘"'『「《〈`;

/** 이만큼 넘게 끌고 가지는 않는다. 코멘트가 가리키던 대목을 벗어나면 뜻이 달라진다. */
const MAX_PULL = 20;
const MAX_PUSH = 40;

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

/**
 * 여는 짝과 닫는 짝을 세어, 구간 안에서 열리고 닫히지 않은 괄호가 있으면 알려 준다.
 * `(가` 처럼 반쪽만 든 구간을 바로잡는 데 쓴다.
 */
function unclosed(text: string, start: number, end: number): number {
  let depth = 0;
  for (let i = start; i < end; i += 1) {
    if (OPENERS.includes(text[i]) && !`"'`.includes(text[i])) depth += 1;
    else if (CLOSERS.includes(text[i]) && !`"'`.includes(text[i])) depth = Math.max(0, depth - 1);
  }
  return depth;
}

/** 구간 앞끝을 어절 · 문장 머리로 당긴다. */
function snapStart(text: string, start: number): number {
  if (start <= 0) return 0;

  // 이미 공백 뒤(어절 머리)면 그대로 둔다.
  if (isSpace(text[start - 1])) return start;

  let at = start;
  const limit = Math.max(0, start - MAX_PULL);
  while (at > limit) {
    const prev = text[at - 1];
    // 문장부호 바로 뒤면 거기가 문장 머리다.
    if (SENTENCE_END.test(prev) || CLAUSE_END.test(prev)) return at;
    if (isSpace(prev)) return at;
    // 여는 괄호 뒤에서 시작했으면 괄호까지 품는다.
    if (OPENERS.includes(prev)) return at - 1;
    at -= 1;
  }
  // 너무 멀면 당기지 않는다 — 어중간해도 원래 자리가 낫다.
  return start;
}

/** 구간 뒤끝을 문장부호까지 민다. */
function snapEnd(text: string, start: number, end: number): number {
  let at = Math.max(end, start + 1);

  // 구간 안에 열어 놓고 안 닫은 괄호가 있으면 먼저 닫는다 — `(가` 같은 경우.
  let depth = unclosed(text, start, at);
  if (depth > 0) {
    const limit = Math.min(text.length, at + MAX_PUSH);
    while (at < limit && depth > 0) {
      if (CLOSERS.includes(text[at]) && !`"'`.includes(text[at])) depth -= 1;
      at += 1;
    }
  }

  // 이미 문장이 끝난 자리면 됐다.
  if (at >= text.length) return text.length;
  if (SENTENCE_END.test(text[at - 1])) return eatClosers(text, at);

  const limit = Math.min(text.length, at + MAX_PUSH);
  let clause = -1;
  for (let i = at; i < limit; i += 1) {
    if (SENTENCE_END.test(text[i])) return eatClosers(text, i + 1);
    if (clause === -1 && CLAUSE_END.test(text[i])) clause = i + 1;
  }
  // 문장 끝이 너무 멀면 절 경계에서 끊는다.
  if (clause !== -1) return eatClosers(text, clause);

  // 그것도 없으면 적어도 어절은 끝낸다.
  for (let i = at; i < limit; i += 1) {
    if (isSpace(text[i])) return i;
  }
  return at;
}

/** 바로 뒤에 붙은 닫는 짝(따옴표 · 괄호)까지 품는다. */
function eatClosers(text: string, at: number): number {
  let end = at;
  while (end < text.length && CLOSERS.includes(text[end])) end += 1;
  return end;
}

/**
 * 구간을 말이 되는 자리로 옮겨 붙인다.
 * 답안 밖으로 나가거나 뒤집힌 것은 부르는 쪽에서 이미 걸러 놓았다고 본다.
 */
export function snapRange(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  if (to <= from) return { start: from, end: to };

  const snappedStart = snapStart(text, from);
  const snappedEnd = snapEnd(text, snappedStart, to);

  // 앞뒤 공백은 구간에 넣지 않는다 — 칠한 자리가 허공에서 시작해 보인다.
  let a = snappedStart;
  let b = snappedEnd;
  while (a < b && isSpace(text[a])) a += 1;
  while (b > a && isSpace(text[b - 1])) b -= 1;

  return b > a ? { start: a, end: b } : { start: snappedStart, end: snappedEnd };
}
