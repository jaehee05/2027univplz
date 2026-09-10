"use client";

import { useMemo } from "react";

import { ManuscriptGrid } from "@/components/manuscript/ManuscriptGrid";
import { layoutManuscript } from "@/lib/manuscript/layout";
import { DEFAULT_SPEC, planRows, type LengthRule } from "@/lib/manuscript/spec";
import type { InlineComment } from "@/lib/types/work";

/** A4 한 쪽(좌우 15mm 여백)에 38칸이 들어가는 칸 크기 */
const PRINT_CELL = 17;

export function PrintSheet({
  text = "",
  lengthRule,
  label,
  comments = [],
}: {
  text?: string;
  lengthRule: LengthRule | null;
  label?: string;
  comments?: InlineComment[];
}) {
  // 화면과 같은 번호를 종이에도 붙인다 — 답안 순서대로 1번부터.
  const marks = useMemo(
    () =>
      [...comments]
        .sort((a, b) => a.start - b.start)
        .map((comment, index) => ({ ...comment, index: index + 1 })),
    [comments],
  );

  const layout = useMemo(() => layoutManuscript(text, DEFAULT_SPEC), [text]);
  const rows = useMemo(() => {
    const planned = lengthRule
      ? planRows(DEFAULT_SPEC, lengthRule)
      : layout.usedRows + DEFAULT_SPEC.extraLines;
    return Math.max(planned, layout.usedRows + 1);
  }, [layout.usedRows, lengthRule]);

  return (
    <div className="print-block">
      <ManuscriptGrid
        spec={DEFAULT_SPEC}
        rows={rows}
        layout={layout}
        lengthRule={lengthRule}
        label={label}
        issues={marks}
        cellSize={PRINT_CELL}
      />
    </div>
  );
}
