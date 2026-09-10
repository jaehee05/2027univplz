"use client";

import { useMemo } from "react";

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
  good: "bg-emerald-100",
  warning: "bg-amber-100",
  error: "bg-red-100",
};

// 겹칠 때 더 센 쪽이 이긴다.
const MARK_WEIGHT: Record<Exclude<MarkTone, "info">, number> = { good: 1, warning: 2, error: 3 };

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
    const map = new Map<string, number[]>();
    for (const issue of issues) {
      if (issue.index == null) continue;
      // 시작 위치를 담고 있는 칸을 찾는다. 없으면(공백에서 시작) 그 뒤 첫 칸.
      const cell =
        layout.cells.find((c) => issue.start >= c.start && issue.start < c.end) ??
        layout.cells.find((c) => c.start >= issue.start);
      if (!cell) continue;
      const key = `${cell.row}:${cell.col}`;
      map.set(key, [...(map.get(key) ?? []), issue.index]);
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
      <div className="inline-flex items-start" style={{ ["--cell" as string]: `${cellSize}px` }}>
        {/* 바깥 테두리는 여기 한 번만 두르고, 안쪽 격자선은 모두 같은 굵기·색으로 그린다 */}
        <div className="border border-sky-400 bg-white">
          {grid.map((line, row) => (
            <div key={row} className="flex">
              {row === 0 && spec.labelCells > 0 ? (
                <div
                  className="flex items-center justify-center border-r border-b border-sky-200 font-medium text-sky-700"
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
                        onMarkSelect(numbers[0]);
                        return;
                      }
                      onCellSelect?.(slot.cell ? slot.cell.start : (layout.cells.at(-1)?.end ?? 0));
                    }}
                    className={[
                      "relative flex items-center justify-center border-sky-200 leading-none",
                      isLastCol ? "" : "border-r",
                      row === lastRow ? "" : "border-b",
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

                    {/* 코멘트 번호 — 목록의 같은 번호와 이어진다 */}
                    {markers.get(key)?.map((number, order) => (
                      <span
                        key={number}
                        className="pointer-events-none absolute -top-[3px] flex items-center justify-center rounded-full bg-neutral-900 font-bold text-white"
                        style={{
                          left: `${-3 + order * 9}px`,
                          width: "13px",
                          height: "13px",
                          fontSize: "9px",
                          lineHeight: "13px",
                        }}
                      >
                        {number}
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
                style={{ height: "var(--cell)" }}
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
