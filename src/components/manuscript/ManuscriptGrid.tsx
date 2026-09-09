"use client";

import { useMemo } from "react";

import type { Cell, LayoutResult } from "@/lib/manuscript/layout";
import type { RuleIssue } from "@/lib/manuscript/rules";
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
  issues?: RuleIssue[];
  cellSize?: number;
}

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
  cellSize = 22,
}: ManuscriptGridProps) {
  const range = lengthRule ? lengthRange(lengthRule) : null;

  const filled = useMemo(() => {
    const map = new Map<string, Cell>();
    for (const cell of layout.cells) map.set(`${cell.row}:${cell.col}`, cell);
    return map;
  }, [layout.cells]);

  const flagged = useMemo(() => {
    const marks = new Map<string, "error" | "warning">();
    for (const issue of issues) {
      if (issue.severity === "info" || issue.end <= issue.start) continue;
      for (const cell of layout.cells) {
        if (cell.start < issue.end && cell.end > issue.start) {
          const key = `${cell.row}:${cell.col}`;
          if (issue.severity === "error" || !marks.has(key)) marks.set(key, issue.severity);
        }
      }
    }
    return marks;
  }, [issues, layout.cells]);

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
                  className="flex items-center justify-center border-r border-b border-sky-200 text-[11px] font-medium text-sky-700"
                  style={{
                    width: `calc(var(--cell) * ${spec.labelCells})`,
                    height: "var(--cell)",
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
                      onCellSelect?.(slot.cell ? slot.cell.start : (layout.cells.at(-1)?.end ?? 0));
                    }}
                    className={[
                      "relative flex items-center justify-center border-sky-200 text-[13px] leading-none",
                      isLastCol ? "" : "border-r",
                      row === lastRow ? "" : "border-b",
                      mark === "error"
                        ? "bg-red-100"
                        : mark === "warning"
                          ? "bg-amber-100"
                          : overLimit
                            ? "bg-red-50"
                            : "bg-transparent",
                      isCaret ? "ring-2 ring-inset ring-sky-500" : "",
                      onCellSelect ? "cursor-text" : "cursor-default",
                    ].join(" ")}
                    style={{ width: "var(--cell)", height: "var(--cell)" }}
                    title={isTarget && range ? `${range.target}자 지점` : undefined}
                  >
                    {slot.cell ? (
                      <>
                        <span
                          className={[
                            slot.cell.text.length === 2 ? "text-[10px] tracking-tighter" : "",
                            // 문장부호를 함께 적은 칸은 본 글자를 살짝 왼쪽으로 민다
                            slot.cell.appended ? "-translate-x-[2px]" : "",
                          ].join(" ")}
                        >
                          {slot.cell.text}
                        </span>
                        {slot.cell.appended ? (
                          <span className="absolute right-[1px] bottom-0 text-[10px] leading-[1.1] text-neutral-800">
                            {slot.cell.appended}
                          </span>
                        ) : null}
                      </>
                    ) : null}

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
