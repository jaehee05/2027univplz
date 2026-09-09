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
      const next = last.col + 1 >= rowCapacity(spec, last.row)
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

  return (
    <div className="overflow-x-auto">
      <div className="inline-block" style={{ ["--cell" as string]: `${cellSize}px` }}>
        {grid.map((line, row) => {
          const cumulative = cumulativeThrough(spec, row);
          const showTick = (row + 1) % spec.tickEvery === 0 || row === 0 || row === rows - 1;

          return (
            <div key={row} className="flex items-stretch">
              {row === 0 && label ? (
                <div
                  className="flex items-center justify-center border border-sky-400 text-[11px] font-medium text-sky-700"
                  style={{
                    width: `calc(var(--cell) * ${spec.labelCells})`,
                    height: "var(--cell)",
                  }}
                >
                  {label}
                </div>
              ) : row === 0 ? (
                <div style={{ width: `calc(var(--cell) * ${spec.labelCells})` }} />
              ) : null}

              <div className="flex">
                {line.map((slot) => {
                  const key = `${slot.row}:${slot.col}`;
                  const overLimit = range != null && slot.index > range.max;
                  const isTarget =
                    targetPos != null && targetPos.row === slot.row && targetPos.col === slot.col;
                  const mark = flagged.get(key);
                  const isCaret = caretKey === key;

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
                        "relative flex items-center justify-center border-r border-b border-sky-200 text-[13px] leading-none",
                        slot.col === 0 ? "border-l border-sky-300" : "",
                        slot.row === 0 ? "border-t border-sky-300" : "",
                        overLimit ? "bg-red-50" : "bg-white",
                        mark === "error" ? "bg-red-100" : mark === "warning" ? "bg-amber-100" : "",
                        isCaret ? "ring-2 ring-inset ring-sky-500" : "",
                        isTarget ? "border-r-2 border-r-sky-600" : "",
                        onCellSelect ? "cursor-text" : "cursor-default",
                      ].join(" ")}
                      style={{ width: "var(--cell)", height: "var(--cell)" }}
                      title={isTarget && range ? `${range.target}자 지점` : undefined}
                    >
                      <span className={slot.cell?.text.length === 2 ? "text-[10px] tracking-tighter" : ""}>
                        {slot.cell?.text ?? ""}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className="flex w-12 items-center justify-start pl-1 text-[10px] text-neutral-400"
                style={{ height: "var(--cell)" }}
              >
                {showTick ? cumulative : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
