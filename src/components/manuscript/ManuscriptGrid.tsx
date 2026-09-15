"use client";

import { useMemo } from "react";

import { markLabel } from "@/components/correction/tone";

import type { Cell, LayoutResult } from "@/lib/manuscript/layout";
import {
  cumulativeThrough,
  lengthRange,
  positionOf,
  rowCapacity,
  type LengthRule,
  type ManuscriptSpec,
} from "@/lib/manuscript/spec";

interface ManuscriptGridProps {
  spec: ManuscriptSpec;
  rows: number;
  layout: LayoutResult;
  lengthRule: LengthRule | null;
  /** 첫 줄 왼쪽 라벨 (예: "문제 1-1") */
  label?: string;
  /** 원문 커서 위치 — 해당 칸을 강조한다 */
  caretOffset?: number | null;
  onCellSelect?: (offset: number) => void;
  /**
   * 칸에 색을 입힐 구간. 작성법 경고와 첨삭 코멘트가 같은 모양을 쓴다.
   * (`lib/manuscript/rules` 의 RuleIssue 와 구조가 같다.)
   */
  issues?: Mark[];
  /** 지금 보고 있는 코멘트 — 테두리로 따로 표시한다 */
  activeRange?: { start: number; end: number } | null;
  /** 번호가 붙은 칸을 눌렀을 때 */
  onMarkSelect?: (index: number) => void;
  cellSize?: number;
}

export type MarkTone = "good" | "info" | "warning" | "error";

export interface Mark {
  severity: MarkTone;
  start: number;
  end: number;
  /** 코멘트 번호 — 있으면 시작 칸에 작게 붙여 목록과 잇는다 */
  index?: number;
}

const MARK_CLASS: Record<Exclude<MarkTone, "info">, string> = {
  good: "bg-emerald-200/70",
  warning: "bg-amber-200/80",
  error: "bg-rose-200/80",
};

// 겹칠 때 더 센 쪽이 이긴다.
const MARK_WEIGHT: Record<Exclude<MarkTone, "info">, number> = { good: 1, warning: 2, error: 3 };

/** 칸 위에 뜨는 `1)` 번호의 색 — 칠한 색과 같은 계열로 잇는다. */
const LABEL_CLASS: Record<MarkTone, string> = {
  good: "text-emerald-700",
  info: "text-slate-600",
  warning: "text-amber-700",
  error: "text-rose-700",
};

interface Slot {
  row: number;
  col: number;
  /** 이 칸이 몇 번째 칸인지 (1-based) */
  index: number;
  cell: Cell | null;
}

export function ManuscriptGrid({
  spec,
  rows,
  layout,
  lengthRule,
  label,
  caretOffset,
  onCellSelect,
  issues = [],
  activeRange = null,
  onMarkSelect,
  cellSize = 22,
}: ManuscriptGridProps) {
  const range = lengthRule ? lengthRange(lengthRule) : null;
  /**
   * 번호는 원문자(①) 대신 `1)` 로 칸 **위**에 작게 앉힌다.
   * 칸 크기를 따라가되 너무 작아지면 읽히지 않아 하한을 둔다.
   */
  const labelSize = Math.max(9, Math.min(13, Math.round(cellSize * 0.52)));
  const labelHeight = labelSize + 2;
  /**
   * 번호가 붙는 원고지는 **줄마다 위에 빈 띠**를 두고 거기에 번호를 앉힌다.
   * 칸 위에 그냥 얹으면 윗줄 글자를 가린다 — 원고지는 칸이 빈틈없이 붙어 있어서
   * 번호가 들어갈 자리가 따로 없다.
   *
   * 번호가 없는 원고지(쓰는 화면 · 빈 답안지)는 띠를 두지 않는다. 칸이 그대로 이어져
   * 여느 원고지와 같은 모양이 된다.
   */
  const numbered = issues.some((issue) => issue.index != null);
  const gutter = numbered ? labelHeight : 0;

  const filled = useMemo(() => {
    const map = new Map<string, Cell>();
    for (const cell of layout.cells) map.set(`${cell.row}:${cell.col}`, cell);
    return map;
  }, [layout.cells]);

  const flagged = useMemo(() => {
    const marks = new Map<string, Exclude<MarkTone, "info">>();
    for (const issue of issues) {
      if (issue.severity === "info" || issue.end <= issue.start) continue;
      const tone = issue.severity;
      for (const cell of layout.cells) {
        if (cell.start < issue.end && cell.end > issue.start) {
          const key = `${cell.row}:${cell.col}`;
          const current = marks.get(key);
          if (!current || MARK_WEIGHT[tone] > MARK_WEIGHT[current]) marks.set(key, tone);
        }
      }
    }
    return marks;
  }, [issues, layout.cells]);

  /** 코멘트 번호를 붙일 칸 — 그 코멘트가 시작되는 칸이다. */
  const markers = useMemo(() => {
    const map = new Map<string, { index: number; severity: MarkTone }[]>();
    for (const issue of issues) {
      if (issue.index == null) continue;
      // 시작 위치를 담고 있는 칸을 찾는다. 없으면(공백에서 시작) 그 뒤 첫 칸.
      const cell =
        layout.cells.find((c) => issue.start >= c.start && issue.start < c.end) ??
        layout.cells.find((c) => c.start >= issue.start);
      if (!cell) continue;
      const key = `${cell.row}:${cell.col}`;
      map.set(key, [
        ...(map.get(key) ?? []),
        { index: issue.index, severity: issue.severity },
      ]);
    }
    return map;
  }, [issues, layout.cells]);

  /** 지금 보고 있는 코멘트가 덮는 칸 */
  const active = useMemo(() => {
    const keys = new Set<string>();
    if (!activeRange || activeRange.end <= activeRange.start) return keys;
    for (const cell of layout.cells) {
      if (cell.start < activeRange.end && cell.end > activeRange.start) {
        keys.add(`${cell.row}:${cell.col}`);
      }
    }
    return keys;
  }, [activeRange, layout.cells]);

  const caretKey = useMemo(() => {
    if (caretOffset == null) return null;
    for (const cell of layout.cells) {
      if (caretOffset >= cell.start && caretOffset < cell.end) return `${cell.row}:${cell.col}`;
    }
    const last = layout.cells.at(-1);
    if (!last) return "0:0";
    if (caretOffset >= last.end) {
      const next =
        last.col + 1 >= rowCapacity(spec, last.row)
          ? { row: last.row + 1, col: 0 }
          : { row: last.row, col: last.col + 1 };
      return `${next.row}:${next.col}`;
    }
    return null;
  }, [caretOffset, layout.cells, spec]);

  const grid: Slot[][] = useMemo(() => {
    const result: Slot[][] = [];
    for (let row = 0; row < rows; row += 1) {
      const capacity = rowCapacity(spec, row);
      const base = row === 0 ? 0 : cumulativeThrough(spec, row - 1);
      const line: Slot[] = [];
      for (let col = 0; col < capacity; col += 1) {
        line.push({ row, col, index: base + col + 1, cell: filled.get(`${row}:${col}`) ?? null });
      }
      result.push(line);
    }
    return result;
  }, [filled, rows, spec]);

  const targetPos = range ? positionOf(spec, range.target) : null;
  const lastRow = rows - 1;

  return (
    <div className="overflow-x-auto">
      <div
        className="inline-flex items-start"
        style={{ ["--cell" as string]: `${cellSize}px` }}
      >
        {/*
          번호 띠가 없으면 바깥 테두리를 한 번만 두르고 안쪽 격자선을 그린다 (여느 원고지).
          띠가 있으면 줄이 서로 떨어지므로 줄마다 테두리를 두른다.
        */}
        <div className={gutter ? "" : "border border-sky-400 bg-white"}>
          {grid.map((line, row) => (
            <div
              key={row}
              className={[
                "flex",
                gutter ? "border border-sky-400 bg-white" : "",
              ].join(" ")}
              // 번호가 앉을 빈 띠. 첫 줄 위에도 똑같이 둔다.
              style={gutter ? { marginTop: `${gutter}px` } : undefined}
            >
              {row === 0 && spec.labelCells > 0 ? (
                <div
                  className="flex shrink-0 items-center justify-center border-r border-b border-sky-200 font-medium text-sky-700"
                  style={{
                    width: `calc(var(--cell) * ${spec.labelCells})`,
                    height: "var(--cell)",
                    fontSize: "calc(var(--cell) * 0.5)",
                  }}
                >
                  {label ?? ""}
                </div>
              ) : null}

              {line.map((slot, col) => {
                const key = `${slot.row}:${slot.col}`;
                const overLimit = range != null && slot.index > range.max;
                const isTarget =
                  targetPos != null && targetPos.row === slot.row && targetPos.col === slot.col;
                const mark = flagged.get(key);
                const isCaret = caretKey === key;
                const isLastCol = col === line.length - 1;

                return (
                  <button
                    key={key}
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const numbers = markers.get(key);
                      if (numbers?.length && onMarkSelect) {
                        onMarkSelect(numbers[0].index);
                        return;
                      }
                      onCellSelect?.(slot.cell ? slot.cell.start : (layout.cells.at(-1)?.end ?? 0));
                    }}
                    className={[
                      // shrink-0 — 좁은 자리에 넣으면 칸이 눌려 글자가 어긋난다. 대신 가로로 스크롤한다.
                      "relative flex shrink-0 items-center justify-center border-sky-200 leading-none",
                      isLastCol ? "" : "border-r",
                      gutter || row === lastRow ? "" : "border-b",
                      mark ? MARK_CLASS[mark] : overLimit ? "bg-red-50" : "bg-transparent",
                      active.has(key) ? "ring-2 ring-inset ring-neutral-900" : "",
                      isCaret ? "ring-2 ring-inset ring-sky-500" : "",
                      onCellSelect ? "cursor-text" : markers.has(key) ? "cursor-pointer" : "cursor-default",
                    ].join(" ")}
                    style={{
                      width: "var(--cell)",
                      height: "var(--cell)",
                      fontSize: "calc(var(--cell) * 0.62)",
                    }}
                    title={isTarget && range ? `${range.target}자 지점` : undefined}
                  >
                    {slot.cell ? (
                      <>
                        <span
                          // 숫자·영문 두 자는 한 칸에 나란히 들어간다.
                          // 폭이 좁은 글자라 크기는 거의 그대로 두고 자간만 좁힌다.
                          className={slot.cell.appended ? "-translate-x-[2px]" : ""}
                          style={
                            slot.cell.text.length === 2
                              ? { fontSize: "calc(var(--cell) * 0.55)", letterSpacing: "-0.04em" }
                              : undefined
                          }
                        >
                          {slot.cell.text}
                        </span>
                        {slot.cell.appended ? (
                          <span
                            className="absolute right-[1px] bottom-0 leading-[1.1] text-neutral-800"
                            style={{ fontSize: "calc(var(--cell) * 0.45)" }}
                          >
                            {slot.cell.appended}
                          </span>
                        ) : null}
                      </>
                    ) : null}

                    {/* 코멘트 번호 — 칸 위에 `1)` 로 작게. 목록의 같은 번호와 이어진다 */}
                    {markers.get(key)?.map((mark, order) => (
                      <span
                        key={mark.index}
                        className={[
                          "pointer-events-none absolute font-bold tabular-nums",
                          LABEL_CLASS[mark.severity],
                        ].join(" ")}
                        style={{
                          // 줄 위 빈 띠 안에 앉는다 — 어느 글자도 가리지 않는다.
                          top: `${-(labelHeight + 1)}px`,
                          left: `${order * (labelSize * 1.5)}px`,
                          height: `${labelHeight}px`,
                          fontSize: `${labelSize}px`,
                          lineHeight: `${labelHeight}px`,
                        }}
                      >
                        {markLabel(mark.index)}
                      </span>
                    ))}

                    {isTarget ? (
                      <span className="pointer-events-none absolute top-0 -right-px h-full w-[2px] bg-sky-600" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* 우측 누적 글자 수 눈금 */}
        <div className="flex flex-col">
          {grid.map((_, row) => {
            const showTick = (row + 1) % spec.tickEvery === 0 || row === 0 || row === lastRow;
            return (
              <div
                key={row}
                className="flex w-12 items-center pl-1 text-[10px] text-neutral-400"
                style={{
                  height: "var(--cell)",
                  // 줄 위 번호 띠만큼 눈금도 함께 내려가야 줄과 나란히 선다.
                  marginTop: gutter ? `${gutter + 2}px` : undefined,
                }}
              >
                {showTick ? cumulativeThrough(spec, row) : ""}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
