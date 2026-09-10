"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ManuscriptGrid } from "@/components/manuscript/ManuscriptGrid";
import { layoutManuscript } from "@/lib/manuscript/layout";
import { checkManuscript, type RuleIssue } from "@/lib/manuscript/rules";
import {
  lengthRange,
  planRows,
  type LengthRule,
  type ManuscriptSpec,
} from "@/lib/manuscript/spec";

interface ManuscriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  spec: ManuscriptSpec;
  lengthRule: LengthRule | null;
  label?: string;
  readOnly?: boolean;
}

/** 칸 크기 한도 — 이보다 작아지면 글자가 안 읽혀서 가로 스크롤로 넘긴다. */
const MIN_CELL = 15;
const MAX_CELL = 22;
/** 오른쪽 눈금과 좌우 안쪽 여백 */
const TICK_GUTTER = 60;

const SEVERITY_STYLE: Record<RuleIssue["severity"], string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-neutral-200 bg-neutral-50 text-neutral-600",
};

export function ManuscriptEditor({
  value,
  onChange,
  spec,
  lengthRule,
  label,
  readOnly = false,
}: ManuscriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  const [cellSize, setCellSize] = useState(MAX_CELL);

  /**
   * 칸 크기를 남는 폭에 맞춘다.
   * 문제지와 나란히 놓으면 원고지가 폭을 고정으로 차지해 문제지 칸이 지나치게 좁아진다.
   * 좁으면 칸을 줄이고, 넓으면 원래 크기로 돌아간다. 더 줄일 수 없으면 가로로 스크롤한다.
   */
  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const measure = () => {
      // 오른쪽 누적 글자 수 눈금과 안쪽 여백만큼 뺀다.
      const usable = node.clientWidth - TICK_GUTTER;
      const fitted = Math.floor(usable / spec.cols);
      setCellSize(Math.max(MIN_CELL, Math.min(MAX_CELL, fitted)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [spec.cols]);

  const layout = useMemo(() => layoutManuscript(value, spec), [value, spec]);
  const issues = useMemo(
    () => checkManuscript(value, layout, lengthRule),
    [value, layout, lengthRule],
  );
  const range = lengthRule ? lengthRange(lengthRule) : null;

  const rows = useMemo(() => {
    const planned = lengthRule ? planRows(spec, lengthRule) : layout.usedRows + spec.extraLines;
    return Math.max(planned, layout.usedRows + 1);
  }, [layout.usedRows, lengthRule, spec]);

  // 칸을 누르면 그 자리로 커서를 옮겨 이어 쓸 수 있게 한다.
  useEffect(() => {
    if (pendingCaret == null) return;
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(pendingCaret, pendingCaret);
    setCaret(pendingCaret);
    setPendingCaret(null);
  }, [pendingCaret]);

  const syncCaret = () => setCaret(textareaRef.current?.selectionStart ?? null);

  const counts = (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <span className="font-medium">
        {layout.countWithSpace}칸
        {range ? (
          <span
            className={
              layout.countWithSpace > range.max
                ? "text-red-600"
                : layout.countWithSpace >= range.min
                  ? "text-emerald-600"
                  : "text-neutral-500"
            }
          >
            {" / "}
            {range.min}–{range.max}
          </span>
        ) : null}
      </span>
      <span className="text-neutral-500">공백 제외 {layout.countWithoutSpace}칸</span>
      <span className="text-neutral-500">
        {layout.usedRows}줄 / {rows}줄
      </span>
      {range ? (
        <span className="text-neutral-400">
          목표 {range.target}자 내외 (±{Math.round(lengthRule!.tolerance * 100)}%)
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {counts}

      <div ref={frameRef} className="rounded-lg border border-neutral-200 bg-white p-3">
        <ManuscriptGrid
          spec={spec}
          rows={rows}
          layout={layout}
          lengthRule={lengthRule}
          label={label}
          caretOffset={caret}
          issues={issues}
          cellSize={cellSize}
          onCellSelect={readOnly ? undefined : (offset) => setPendingCaret(offset)}
        />
      </div>

      {readOnly ? null : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-500">
            여기에 쓰면 위 원고지에 바로 배치됩니다. 원고지 칸을 누르면 그 자리로 커서가 갑니다.
          </span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setCaret(event.target.selectionStart);
            }}
            onSelect={syncCaret}
            onClick={syncCaret}
            onKeyUp={syncCaret}
            rows={6}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-neutral-300 p-3 font-sans text-base leading-7"
            placeholder="답안을 입력하세요. 줄바꿈은 문단 나눔으로 처리되고, 문단 첫 칸은 자동으로 비웁니다."
          />
        </label>
      )}

      {issues.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {issues.map((issue, index) => (
            <li key={`${issue.rule}-${issue.start}-${index}`}>
              <button
                type="button"
                onClick={() => setPendingCaret(issue.start)}
                disabled={readOnly || issue.severity === "info"}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${SEVERITY_STYLE[issue.severity]} ${
                  issue.severity === "info" ? "cursor-default" : "cursor-pointer"
                }`}
              >
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-400">작성법 경고 없음</p>
      )}
    </div>
  );
}
