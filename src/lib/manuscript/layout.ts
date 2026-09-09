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
  | "INDENT_INSERTED";

export interface LayoutNote {
  kind: LayoutNoteKind;
  offset: number;
}

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

interface Token {
  text: string;
  start: number;
  end: number;
  kind: "text" | "space" | "break";
}

/** 원문을 칸 단위 토큰으로 나눈다. 숫자·영문은 한 칸에 두 자씩 묶는다. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === "\n") {
      tokens.push({ text: "\n", start: i, end: i + 1, kind: "break" });
      i += 1;
      continue;
    }
    if (isSpace(ch)) {
      tokens.push({ text: " ", start: i, end: i + 1, kind: "space" });
      i += 1;
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
 */
export function layoutManuscript(source: string, spec: ManuscriptSpec): LayoutResult {
  const cells: Cell[] = [];
  const notes: LayoutNote[] = [];

  let row = 0;
  let col = 0;
  let atParagraphStart = true;

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
    advance();
  };

  for (const token of tokenize(source)) {
    if (token.kind === "break") {
      // 줄바꿈 = 문단 나눔. 쓰던 줄을 접고 다음 줄로 간다.
      if (col !== 0) {
        row += 1;
        col = 0;
      }
      atParagraphStart = true;
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
    if (col === 0 && LEADING_FORBIDDEN.has(head) && cells.length > 0) {
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
