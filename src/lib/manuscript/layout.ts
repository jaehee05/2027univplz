import { rowCapacity, type ManuscriptSpec } from "@/lib/manuscript/spec";

export type CellKind = "text" | "space" | "indent";

export interface Cell {
  row: number;
  col: number;
  /** 칸에 들어가는 글자. 숫자·영문은 한 칸에 두 자가 들어간다. */
  text: string;
  /** 줄 첫 칸에 올 수 없어 이 칸에 함께 적은 문장부호 */
  appended: string;
  /** 원문에서 이 칸이 차지하는 범위 [start, end) */
  start: number;
  end: number;
  kind: CellKind;
}

export type LayoutNoteKind =
  | "PUNCT_WRAPPED"
  | "SPACE_AT_LINE_START"
  | "SPACE_AFTER_PUNCT"
  | "BRACKET_PUSHED"
  | "INDENT_INSERTED"
  // 옮겨 쓰기(literal)에서 학생이 어긴 원고지 사용법
  | "MISSING_INDENT"
  | "EXTRA_INDENT"
  | "BLANK_AT_LINE_START"
  | "BLANK_AFTER_PUNCT"
  | "PUNCT_AT_LINE_START"
  | "BRACKET_AT_LINE_END";

export interface LayoutNote {
  kind: LayoutNoteKind;
  offset: number;
  /** 어긴 자리가 차지하는 원문 범위의 끝. 없으면 한 글자 */
  end?: number;
}

export interface LayoutOptions {
  /**
   * 옮겨 쓰기 — 선생님이 학생 원고지를 칸 그대로 옮길 때 쓴다.
   * 규칙을 대신 지켜 주지 않고 친 그대로 칸에 넣은 뒤, 어긴 자리를 notes 에 남긴다.
   *  · 문단 첫 칸은 친 공백만큼 비운다 (자동으로 비우지 않음)
   *  · 공백은 어디서든 한 칸 — 줄 첫 칸이든 마침표 뒤든
   *  · `|` 는 학생이 줄을 바꾼 자리. 그 뒤 줄 첫 칸의 문장부호는 제 칸에 들어간다
   *    (`|` 없이 줄이 꽉 차 넘어간 문장부호는 학생이 앞 칸에 함께 쓴 것으로 본다)
   *  · 여는 괄호가 줄 마지막 칸에 와도 내리지 않는다
   */
  literal?: boolean;
}

/** 옮겨 쓰기에서 학생이 줄을 바꾼 자리 */
export const LINE_BREAK_MARK = "|";

export interface LayoutResult {
  cells: Cell[];
  /** 실제로 사용한 줄 수 */
  usedRows: number;
  /** 원고지 칸 기준 글자 수 (들여쓰기·띄어쓰기 포함) */
  countWithSpace: number;
  /** 원고지 칸 기준 글자 수 (글자 칸만) */
  countWithoutSpace: number;
  notes: LayoutNote[];
}

/** 줄 첫 칸에 올 수 없는 글자 — 앞 줄 마지막 칸에 함께 쓴다. */
const LEADING_FORBIDDEN = new Set([
  ".", ",", "!", "?", ":", ";", "、", "。", "·",
  ")", "]", "}", "”", "’", "」", "』", "〉", "》", ">",
]);

/**
 * 뒤 칸을 비우지 않는 문장부호.
 * 마침표·쉼표는 한 칸을 차지하고 다음 글자를 바로 이어 쓴다.
 * 물음표·느낌표는 뒤에 한 칸을 비우므로 여기 넣지 않는다.
 */
const NO_SPACE_AFTER = new Set([".", ",", "、", "。", "·"]);

/** 줄 마지막 칸에 올 수 없는 글자 — 다음 줄로 내린다. */
const TRAILING_FORBIDDEN = new Set([
  "(", "[", "{", "“", "‘", "「", "『", "〈", "《", "<",
]);

const isSpace = (ch: string) => ch === " " || ch === "\t" || ch === "　";
const isAlnum = (ch: string) => /[0-9A-Za-z]/.test(ch);

/** 소수 — 소수점도 숫자와 함께 두 자씩 묶는다. */
const DECIMAL = /^\d+\.\d+/;

interface Token {
  text: string;
  start: number;
  end: number;
  kind: "text" | "space" | "break" | "linebreak";
  /** 소수 조각. ".5"처럼 점으로 시작해도 문장부호가 아니다. */
  numeric?: boolean;
}

/** 원문을 칸 단위 토큰으로 나눈다. 숫자·영문은 한 칸에 두 자씩 묶는다. */
function tokenize(source: string, literal: boolean): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === "\n") {
      tokens.push({ text: "\n", start: i, end: i + 1, kind: "break" });
      i += 1;
      continue;
    }
    if (literal && ch === LINE_BREAK_MARK) {
      tokens.push({ text: ch, start: i, end: i + 1, kind: "linebreak" });
      i += 1;
      continue;
    }
    if (isSpace(ch)) {
      tokens.push({ text: " ", start: i, end: i + 1, kind: "space" });
      i += 1;
      continue;
    }
    const decimal = DECIMAL.exec(source.slice(i));
    if (decimal) {
      // 뒤에서부터 두 자씩 묶는다 — 0.5 → 0|.5, 3.75 → 3.|75
      const end = i + decimal[0].length;
      let from = i;
      let to = i + (decimal[0].length % 2 || 2);
      while (from < end) {
        tokens.push({ text: source.slice(from, to), start: from, end: to, kind: "text", numeric: true });
        from = to;
        to += 2;
      }
      i = end;
      continue;
    }
    if (isAlnum(ch)) {
      const end = isAlnum(source[i + 1] ?? "") ? i + 2 : i + 1;
      tokens.push({ text: source.slice(i, end), start: i, end, kind: "text" });
      i = end;
      continue;
    }
    tokens.push({ text: ch, start: i, end: i + 1, kind: "text" });
    i += 1;
  }

  return tokens;
}

/**
 * 원문을 원고지 칸에 배치한다.
 *
 * 자동으로 적용하는 규칙
 *  · 문단 첫 칸 비우기
 *  · 문장부호는 줄 첫 칸에 두지 않고 앞 줄 마지막 칸에 함께 표기
 *  · 여는 괄호·따옴표는 줄 마지막 칸에 두지 않고 다음 줄로 내림
 *  · 줄 첫 칸의 띄어쓰기는 칸을 쓰지 않음
 *  · 마침표·쉼표 뒤의 띄어쓰기는 칸을 쓰지 않음 (물음표·느낌표 뒤는 한 칸 비움)
 *  · 숫자·영문은 한 칸에 두 자
 *  · 소수는 소수점까지 뒤에서부터 두 자씩 (0.5 → 0|.5, 3.75 → 3.|75)
 */
export function layoutManuscript(
  source: string,
  spec: ManuscriptSpec,
  options: LayoutOptions = {},
): LayoutResult {
  const literal = options.literal ?? false;
  const cells: Cell[] = [];
  const notes: LayoutNote[] = [];

  let row = 0;
  let col = 0;
  let atParagraphStart = true;
  /** 옮겨 쓰기: 문단 머리에서 비운 칸 수. 글자가 나오면 null */
  let leading: number | null = null;
  /** 옮겨 쓰기: 이 줄은 학생이 `|` 로 바꾼 줄이다 */
  let forcedBreak = false;

  const width = () => rowCapacity(spec, row);

  const advance = () => {
    col += 1;
    if (col >= width()) {
      row += 1;
      col = 0;
    }
  };

  const push = (kind: CellKind, text: string, start: number, end: number) => {
    cells.push({ row, col, text, appended: "", start, end, kind });
    forcedBreak = false;
    advance();
  };

  for (const token of tokenize(source, literal)) {
    if (token.kind === "break") {
      // 줄바꿈 = 문단 나눔. 쓰던 줄을 접고 다음 줄로 간다.
      if (col !== 0) {
        row += 1;
        col = 0;
      }
      atParagraphStart = true;
      forcedBreak = false;
      continue;
    }

    if (literal) {
      layoutLiteralToken(token);
      continue;
    }

    if (atParagraphStart) {
      push("indent", "", token.start, token.start);
      notes.push({ kind: "INDENT_INSERTED", offset: token.start });
      atParagraphStart = false;
    }

    if (token.kind === "space") {
      if (col === 0) {
        notes.push({ kind: "SPACE_AT_LINE_START", offset: token.start });
        continue;
      }
      const previous = cells[cells.length - 1];
      const tail = previous ? (previous.appended || previous.text).slice(-1) : "";
      if (previous && NO_SPACE_AFTER.has(tail)) {
        notes.push({ kind: "SPACE_AFTER_PUNCT", offset: token.start });
        continue;
      }
      push("space", "", token.start, token.end);
      continue;
    }

    const head = token.text[0];

    // 줄 첫 칸에 올 수 없는 문장부호 → 앞 칸에 병기
    if (col === 0 && !token.numeric && LEADING_FORBIDDEN.has(head) && cells.length > 0) {
      const previous = cells[cells.length - 1];
      previous.appended += token.text;
      previous.end = token.end;
      notes.push({ kind: "PUNCT_WRAPPED", offset: token.start });
      continue;
    }

    // 줄 마지막 칸에 올 수 없는 여는 괄호 → 다음 줄로
    if (col === width() - 1 && TRAILING_FORBIDDEN.has(head)) {
      row += 1;
      col = 0;
      notes.push({ kind: "BRACKET_PUSHED", offset: token.start });
    }

    push("text", token.text, token.start, token.end);
  }

  /** 옮겨 쓰기 — 친 그대로 칸에 넣고, 어긴 자리를 적어 둔다. */
  function layoutLiteralToken(token: Token) {
    if (token.kind === "linebreak") {
      if (col !== 0) {
        row += 1;
        col = 0;
      }
      forcedBreak = true;
      return;
    }

    if (atParagraphStart) {
      atParagraphStart = false;
      leading = 0;
    }

    if (token.kind === "space") {
      if (leading != null) {
        leading += 1;
        if (leading === 2) notes.push({ kind: "EXTRA_INDENT", offset: token.start });
      } else if (col === 0) {
        notes.push({ kind: "BLANK_AT_LINE_START", offset: token.start });
      } else {
        const previous = cells[cells.length - 1];
        const tail = previous ? (previous.appended || previous.text).slice(-1) : "";
        if (previous && previous.kind === "text" && NO_SPACE_AFTER.has(tail)) {
          notes.push({ kind: "BLANK_AFTER_PUNCT", offset: token.start });
        }
      }
      push(leading != null && leading === 1 ? "indent" : "space", "", token.start, token.end);
      return;
    }

    if (leading === 0) {
      // 첫 어절을 짚는다
      let end = token.end;
      while (end < source.length && !/\s/.test(source[end])) end += 1;
      notes.push({ kind: "MISSING_INDENT", offset: token.start, end });
    }
    leading = null;

    const head = token.text[0];
    if (col === 0 && !token.numeric && LEADING_FORBIDDEN.has(head) && cells.length > 0) {
      if (!forcedBreak) {
        // 줄이 꽉 차 넘어온 문장부호 — 학생이 앞 칸에 함께 쓴 것으로 본다.
        const previous = cells[cells.length - 1];
        previous.appended += token.text;
        previous.end = token.end;
        return;
      }
      notes.push({ kind: "PUNCT_AT_LINE_START", offset: token.start });
    }

    if (col === width() - 1 && TRAILING_FORBIDDEN.has(head)) {
      notes.push({ kind: "BRACKET_AT_LINE_END", offset: token.start });
    }

    push("text", token.text, token.start, token.end);
  }

  const countWithSpace = cells.length;
  const countWithoutSpace = cells.filter((cell) => cell.kind === "text").length;
  const usedRows = cells.length === 0 ? 0 : cells[cells.length - 1].row + 1;

  return { cells, usedRows, countWithSpace, countWithoutSpace, notes };
}

/** 원문 오프셋이 어느 칸에 있는지 찾는다. 커서 위치 표시에 쓴다. */
export function cellAtOffset(cells: Cell[], offset: number): Cell | null {
  for (const cell of cells) {
    if (offset >= cell.start && offset < cell.end) return cell;
  }
  // 글의 끝에 커서가 있을 때는 마지막 칸의 다음 칸을 가리킨다.
  return cells.length > 0 && offset >= cells[cells.length - 1].end
    ? cells[cells.length - 1]
    : null;
}

/**
 * 자동 배치로 쓴 글을 옮겨 쓰기 글로 바꾼다. 원고지 모양은 그대로다.
 * 자동으로 비운 문단 첫 칸은 공백으로, 내린 괄호 앞에는 줄바꿈 표시를 넣고,
 * 칸을 쓰지 않은 공백은 지운다.
 */
export function toLiteral(source: string, spec: ManuscriptSpec): string {
  const { notes } = layoutManuscript(source, spec);
  const insert = new Map<number, string>();
  const drop = new Set<number>();
  for (const note of notes) {
    if (note.kind === "INDENT_INSERTED") insert.set(note.offset, " ");
    if (note.kind === "BRACKET_PUSHED") insert.set(note.offset, LINE_BREAK_MARK);
    if (note.kind === "SPACE_AT_LINE_START" || note.kind === "SPACE_AFTER_PUNCT") drop.add(note.offset);
  }
  let out = "";
  for (let i = 0; i <= source.length; i += 1) {
    out += insert.get(i) ?? "";
    if (i < source.length && !drop.has(i)) out += source[i];
  }
  return out;
}

/** 옮겨 쓰기 글을 자동 배치 글로 되돌린다 — 줄바꿈 표시와 문단 첫 공백 한 칸을 뺀다. */
export function fromLiteral(source: string): string {
  return source
    .split(LINE_BREAK_MARK)
    .join("")
    .split("\n")
    .map((line) => line.replace(/^[ \t　]/, ""))
    .join("\n");
}
