"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AnswerProse } from "@/components/correction/AnswerProse";
import { ManuscriptGrid } from "@/components/manuscript/ManuscriptGrid";
import { useFittedCellSize } from "@/components/manuscript/useFittedCellSize";
import { layoutManuscript } from "@/lib/manuscript/layout";
import { DEFAULT_SPEC, planRows, type LengthRule } from "@/lib/manuscript/spec";
import { SEVERITY_LABEL, totalScore, type Correction, type InlineComment } from "@/lib/types/work";

type Severity = InlineComment["severity"];

const CARD: Record<Severity, string> = {
  good: "border-emerald-200 bg-emerald-50",
  info: "border-neutral-200 bg-neutral-50",
  warning: "border-amber-200 bg-amber-50",
  error: "border-red-200 bg-red-50",
};

const BADGE: Record<Severity, string> = {
  good: "bg-emerald-600",
  info: "bg-neutral-500",
  warning: "bg-amber-500",
  error: "bg-red-600",
};

const ORDER: Severity[] = ["error", "warning", "good", "info"];

export function CorrectionView({
  correction,
  answerText,
  lengthRule,
  label,
}: {
  correction: Correction;
  answerText: string;
  lengthRule: LengthRule | null;
  label?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [view, setView] = useState<"prose" | "grid">("prose");
  const [only, setOnly] = useState<Severity | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cellSize = useFittedCellSize(frameRef, DEFAULT_SPEC.cols);

  // 답안 순서대로 1번부터 번호를 매긴다. 원고지·줄글·목록이 같은 번호를 쓴다.
  const comments = useMemo(
    () =>
      [...correction.inlineComments]
        .sort((a, b) => a.start - b.start)
        .map((comment, index) => ({ ...comment, index: index + 1 })),
    [correction.inlineComments],
  );

  const counts = useMemo(() => {
    const map = new Map<Severity, number>();
    for (const comment of comments) {
      map.set(comment.severity, (map.get(comment.severity) ?? 0) + 1);
    }
    return map;
  }, [comments]);

  const shown = only ? comments.filter((comment) => comment.severity === only) : comments;
  const activeComment = comments.find((comment) => comment.index === active) ?? null;

  const layout = useMemo(() => layoutManuscript(answerText, DEFAULT_SPEC), [answerText]);
  const rows = useMemo(() => {
    const planned = lengthRule
      ? planRows(DEFAULT_SPEC, lengthRule)
      : layout.usedRows + DEFAULT_SPEC.extraLines;
    return Math.max(planned, layout.usedRows + 1);
  }, [layout.usedRows, lengthRule]);

  // 원고지·줄글에서 고른 코멘트가 목록에서도 보이게 따라간다.
  useEffect(() => {
    if (active == null) return;
    listRef.current
      ?.querySelector(`[data-comment="${active}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const total = totalScore(correction.scores);
  const earned = correction.scores.items.reduce((sum, item) => sum + item.awarded, 0);
  const lost = correction.scores.deductions.reduce((sum, item) => sum + item.points, 0);

  return (
    <div className="space-y-8">
      {/* ── 점수 ─────────────────────────────────────────────── */}
      <section className="rounded-lg border border-neutral-200 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">점수</h2>
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{total}</span>
            <span className="text-neutral-400">/ 100</span>
            {lost > 0 ? (
              <span className="text-sm text-neutral-500">
                ({earned} − 감점 {lost})
              </span>
            ) : null}
          </p>
        </div>

        <ul className="mt-4 space-y-3">
          {correction.scores.items.map((item) => {
            const ratio = item.points ? item.awarded / item.points : 0;
            return (
              <li key={item.id} className="grid grid-cols-[1fr_auto] gap-x-3">
                <span className="font-medium">{item.name}</span>
                <span className="shrink-0 tabular-nums">
                  <span
                    className={
                      ratio >= 0.8 ? "text-emerald-700" : ratio <= 0.5 ? "text-red-600" : ""
                    }
                  >
                    {item.awarded}
                  </span>
                  <span className="text-neutral-400"> / {item.points}</span>
                </span>
                <div className="col-span-2 mt-1 h-1.5 w-full rounded bg-neutral-100">
                  <div
                    className={[
                      "h-1.5 rounded",
                      ratio >= 0.8 ? "bg-emerald-600" : ratio <= 0.5 ? "bg-red-500" : "bg-neutral-800",
                    ].join(" ")}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                <p className="col-span-2 mt-1 text-sm leading-6 text-neutral-600">{item.reason}</p>
              </li>
            );
          })}
        </ul>

        {correction.scores.deductions.length > 0 ? (
          <ul className="mt-4 space-y-1 border-t border-neutral-200 pt-3 text-sm">
            {correction.scores.deductions.map((deduction, index) => (
              <li key={index} className="flex gap-2">
                <span className="w-12 shrink-0 text-right font-medium text-red-600 tabular-nums">
                  −{deduction.points}
                </span>
                <span className="leading-6">
                  <span className="font-medium">{deduction.name}</span> — {deduction.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── 답안과 첨삭 ──────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">답안과 첨삭</h2>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex rounded-md border border-neutral-300">
              {(
                [
                  ["prose", "줄글로 읽기"],
                  ["grid", "원고지"],
                ] as const
              ).map(([value, text], index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  className={[
                    "px-3 py-1.5",
                    view === value ? "bg-neutral-900 text-white" : "text-neutral-600",
                    index === 0 ? "rounded-l-md" : "rounded-r-md",
                  ].join(" ")}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-1 text-sm text-neutral-500">
          번호를 누르면 답안의 그 자리와 코멘트가 함께 표시됩니다.
        </p>

        {/* 종류별로 걸러 보기 */}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setOnly(null)}
            className={[
              "rounded-full border px-3 py-1",
              only === null ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
            ].join(" ")}
          >
            전체 {comments.length}
          </button>
          {ORDER.filter((severity) => counts.get(severity)).map((severity) => (
            <button
              key={severity}
              type="button"
              onClick={() => setOnly(only === severity ? null : severity)}
              className={[
                "flex items-center gap-1.5 rounded-full border px-3 py-1",
                only === severity
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300",
              ].join(" ")}
            >
              <span className={`h-2 w-2 rounded-full ${BADGE[severity]}`} />
              {SEVERITY_LABEL[severity]} {counts.get(severity)}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)]">
          <div ref={frameRef} className="min-w-0 rounded-lg border border-neutral-200 p-4">
            {view === "prose" ? (
              <AnswerProse
                text={answerText}
                comments={comments}
                activeIndex={active}
                onSelect={(index) => setActive(index === active ? null : index)}
              />
            ) : (
              <div className="overflow-x-auto">
                <ManuscriptGrid
                  spec={DEFAULT_SPEC}
                  rows={rows}
                  layout={layout}
                  lengthRule={lengthRule}
                  label={label}
                  issues={comments}
                  activeRange={activeComment}
                  cellSize={cellSize}
                  onMarkSelect={(index) => setActive(index === active ? null : index)}
                />
              </div>
            )}
          </div>

          <ul ref={listRef} className="space-y-2 xl:max-h-[70vh] xl:overflow-y-auto xl:pr-1">
            {shown.map((comment) => (
              <li key={comment.index} data-comment={comment.index}>
                <button
                  type="button"
                  onClick={() => setActive(comment.index === active ? null : comment.index)}
                  className={[
                    "flex w-full gap-2 rounded-md border px-3 py-2 text-left text-sm",
                    CARD[comment.severity],
                    active === comment.index ? "ring-2 ring-neutral-900" : "",
                  ].join(" ")}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${BADGE[comment.severity]}`}
                  >
                    {comment.index}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-500">
                      <span className="font-medium text-neutral-700">{comment.category}</span>
                      <span>{SEVERITY_LABEL[comment.severity]}</span>
                      <span className="ml-auto">{comment.start + 1}~{comment.end}자</span>
                    </span>

                    <span className="mt-1 block border-l-2 border-neutral-300 pl-2 text-neutral-500 italic">
                      “{answerText.slice(comment.start, comment.end)}”
                    </span>

                    <span className="mt-1.5 block leading-6">{comment.message}</span>

                    {comment.suggestion ? (
                      <span className="mt-1.5 block rounded bg-white/80 px-2 py-1 leading-6">
                        <b className="text-neutral-500">고쳐 쓰면</b> {comment.suggestion}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 ? (
              <li className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-sm text-neutral-500">
                {comments.length === 0 ? "코멘트가 없습니다." : "이 종류의 코멘트가 없습니다."}
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      {/* ── 총평 ─────────────────────────────────────────────── */}
      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="text-lg font-semibold">총평</h2>
        <p className="mt-2 leading-7 whitespace-pre-wrap">{correction.overall.summary}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-emerald-700">잘한 점</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">
              {correction.overall.strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-700">고칠 점</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">
              {correction.overall.improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {correction.overall.nextSteps.length > 0 ? (
          <div className="mt-4 rounded-md bg-neutral-50 p-3">
            <h3 className="text-sm font-semibold">다음 답안에서 바로 할 것</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-6">
              {correction.overall.nextSteps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {correction.revisedExample ? (
        <section className="rounded-lg border border-neutral-200 p-5">
          <h2 className="text-lg font-semibold">고쳐 쓴 예시</h2>
          <p className="mt-1 text-sm text-neutral-500">
            새로 쓴 모범답안이 아니라, 내가 쓴 답안의 논지를 살려 구성과 문장만 손본 것입니다.
          </p>
          <p className="mt-3 leading-[2.1] break-keep whitespace-pre-wrap">
            {correction.revisedExample}
          </p>
          <p className="mt-2 text-xs text-neutral-400">{correction.revisedExample.length}자</p>
        </section>
      ) : null}
    </div>
  );
}
