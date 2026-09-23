import { layoutManuscript } from "@/lib/manuscript/layout";
import type { ManuscriptSpec } from "@/lib/manuscript/spec";

/**
 * 실제 대학 답안지 PDF 한 장에 글자를 채워 넣기 위한 규격.
 *
 * 좌표는 PDF 포인트이고 원점은 쪽 **왼쪽 아래**다(PDF 그대로).
 * 칸 경계는 답안지 PDF 의 선을 읽어 잰 값이다.
 */
export interface SheetGrid {
  /** 몇 번째 쪽(0부터) */
  page: number;
  /** 문항 번호 — 화면에 보일 이름 */
  number: string;
  /** 문제지에 적힌 분량 조건 */
  lengthNote: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  rows: number;
  cols: number;
  /** 마지막 줄에 있는 칸 수 (1,000자에서 끊기는 답안지가 있다) */
  lastRowCells: number;
}

export interface SheetTemplate {
  id: string;
  name: string;
  /** public/ 아래 빈 답안지 PDF */
  pdf: string;
  /** public/ 아래 쪽마다 미리 그려 둔 배경 그림 */
  backgrounds: string[];
  width: number;
  height: number;
  grids: SheetGrid[];
}

export const SUNGSHIN: SheetTemplate = {
  id: "sungshin",
  name: "성신여대 논술 답안지 (인문)",
  pdf: "/answer-sheet/sungshin.pdf",
  backgrounds: ["/answer-sheet/sungshin-1.jpg", "/answer-sheet/sungshin-2.jpg"],
  width: 595.276,
  height: 841.89,
  grids: [
    {
      page: 0,
      number: "1",
      lengthNote: "900 ± 100자 (800~1,000자)",
      left: 54.5,
      right: 520.5,
      top: 584.1,
      bottom: 43.6,
      rows: 34,
      cols: 30,
      lastRowCells: 10,
    },
    {
      page: 1,
      number: "2",
      lengthNote: "900 ± 100자 (800~1,000자)",
      left: 59.5,
      right: 527.3,
      top: 743.1,
      bottom: 44.1,
      rows: 34,
      cols: 30,
      lastRowCells: 10,
    },
  ],
};

export const FONT_URL = "/fonts/Victory-Medium.ttf";

export const specOf = (grid: SheetGrid): ManuscriptSpec => ({
  cols: grid.cols,
  labelCells: 0,
  tickEvery: 2,
  extraLines: 0,
});

export const capacityOf = (grid: SheetGrid) => (grid.rows - 1) * grid.cols + grid.lastRowCells;

/** 한 글자를 어디에 얼마만 하게 찍을지. 가로는 box 가운데, 세로는 baseline. */
export interface Glyph {
  page: number;
  char: string;
  /** 글자 가운데 x */
  cx: number;
  baseline: number;
  size: number;
}

/** 칸 왼쪽 아래에 찍는 문장부호 — 원고지에서 마침표·쉼표는 칸 왼쪽 아래에 쓴다 */
const LOW_LEFT = new Set([".", ","]);

/** 한글 글자 몸통이 baseline 위 이만큼(em) 가운데에 오게 한다 */
const BODY_CENTER = 0.36;

export interface FilledSheet {
  glyphs: Glyph[];
  /** 칸 기준 글자 수 */
  count: number;
  /** 답안지 칸을 넘친 칸 수 */
  overflow: number;
}

/**
 * 답안을 원고지 규칙대로 칸에 배치하고, 칸마다 글자 하나하나의 자리를 잡는다.
 * 화면 미리보기(SVG)와 PDF 내보내기가 같은 자리를 쓴다.
 */
export function fillGrid(grid: SheetGrid, text: string, literal: boolean): FilledSheet {
  const layout = layoutManuscript(text, specOf(grid), { literal });
  const cw = (grid.right - grid.left) / grid.cols;
  const rh = (grid.top - grid.bottom) / grid.rows;
  const size = Math.min(cw, rh) * 0.72;

  const glyphs: Glyph[] = [];
  let overflow = 0;

  const put = (char: string, x: number, w: number, y: number, h: number, scale = 1) => {
    const s = size * scale;
    glyphs.push({ page: grid.page, char, cx: x + w / 2, baseline: y + h / 2 - s * BODY_CENTER, size: s });
  };

  for (const cell of layout.cells) {
    const inside =
      cell.row < grid.rows - 1 || (cell.row === grid.rows - 1 && cell.col < grid.lastRowCells);
    if (!inside) {
      overflow += 1;
      continue;
    }
    if (cell.kind !== "text") continue;

    const x = grid.left + cell.col * cw;
    const y = grid.top - (cell.row + 1) * rh;
    const chars = [...cell.text];

    if (chars.length === 2) {
      // 숫자·영문 두 자 — 칸을 반씩 나눠 쓴다
      put(chars[0], x + cw * 0.04, cw * 0.46, y, rh, 0.82);
      put(chars[1], x + cw * 0.5, cw * 0.46, y, rh, 0.82);
    } else if (chars.length === 3) {
      // <가> 같은 표지 — 괄호와 글자를 한 칸에 나란히
      put(chars[0], x, cw * 0.22, y, rh, 0.6);
      put(chars[1], x + cw * 0.22, cw * 0.56, y, rh, 0.62);
      put(chars[2], x + cw * 0.78, cw * 0.22, y, rh, 0.6);
    } else if (LOW_LEFT.has(cell.text)) {
      put(cell.text, x, cw * 0.5, y, rh);
    } else {
      put(cell.text, x, cw, y, rh);
    }

    // 줄 끝에 함께 쓴 문장부호는 칸 오른쪽 아래에
    for (const mark of cell.appended) put(mark, x + cw * 0.62, cw * 0.38, y, rh, 0.9);
  }

  return { glyphs, count: layout.countWithSpace, overflow };
}
