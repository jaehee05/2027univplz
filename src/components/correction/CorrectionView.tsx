"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AnswerProse } from "@/components/correction/AnswerProse";
import { CommentSheet } from "@/components/correction/CommentSheet";
import { ScoreRing } from "@/components/correction/ScoreRing";
import {
  ACCENT,
  CARD,
  DOT,
  ORDER,
  markLabel,
  numbered,
  type Severity,
} from "@/components/correction/tone";
import { ManuscriptGrid } from "@/components/manuscript/ManuscriptGrid";
import { useFittedCellSize } from "@/components/manuscript/useFittedCellSize";
import { layoutManuscript } from "@/lib/manuscript/layout";
import { DEFAULT_SPEC, planRows, type LengthRule } from "@/lib/manuscript/spec";
import { SEVERITY_LABEL, totalScore, type Correction } from "@/lib/types/work";

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

  // 답안 순서대로 1번부터. 원고지·줄글·목록·인쇄가 같은 번호를 쓴다.
  const comments = useMemo(
    () => numbered(correction.inlineComments, answerText),
    [correction.inlineComments, answerText],
  );

  const counts = useMemo(() => {
    const map = new Map<Severity, number>();
    for (const comment of comments) {
      const severity = comment.severity as Severity;
      map.set(severity, (map.get(severity) ?? 0) + 1);
    }
    return map;
  }, [comments]);

  const shown = only ? comments.filter((comment) => comment.severity === only) : comments;
  /**
   * 걸러 보기를 바꾸면 고른 코멘트가 목록에서 사라질 수 있다.
   * 상태를 되돌리는 대신 렌더할 때 가려낸다 — 걸러 보기를 풀면 그대로 돌아온다.
   */
  const activeComment = shown.find((comment) => comment.index === active) ?? null;
  const activeIndex = activeComment?.index ?? null;

  const layout = useMemo(() => layoutManuscript(answerText, DEFAULT_SPEC), [answerText]);
  const rows = useMemo(() => {
    const planned = lengthRule
      ? planRows(DEFAULT_SPEC, lengthRule)
      : layout.usedRows + DEFAULT_SPEC.extraLines;
    return Math.max(planned, layout.usedRows + 1);
  }, [layout.usedRows, lengthRule]);

  // 원고지·줄글에서 고른 코멘트가 목록에서도 보이게 따라간다.
  useEffect(() => {
    if (activeIndex == null) return;
    listRef.current
      ?.querySelector(`[data-comment="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  const total = totalScore(correction.scores);
  const earned = correction.scores.items.reduce((sum, item) => sum + item.awarded, 0);
  const lost = correction.scores.deductions.reduce((sum, item) => sum + item.points, 0);

  return (
    <div className="space-y-6">
      {/* ── 점수 ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex items-center gap-4 sm:flex-col sm:gap-2">
            <ScoreRing score={total} />
            {lost > 0 ? (
              <p className="text-sm text-neutral-500">
                {earned} − 감점 {lost}
              </p>
            ) : null}
          </div>

          <ul className="min-w-0 flex-1 space-y-3.5">
            {correction.scores.items.map((item) => {
              const ratio = item.points ? item.awarded / item.points : 0;
              return (
                <li key={item.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{item.name}</span>
                    <span className="shrink-0 text-sm tabular-nums">
                      <span
                        className={
                          ratio >= 0.8
                            ? "font-semibold text-emerald-600"
                            : ratio <= 0.5
                              ? "font-semibold text-rose-600"
                              : "font-semibold"
                        }
                      >
                        {item.awarded}
                      </span>
                      <span className="text-neutral-400"> / {item.points}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={[
                        "h-full rounded-full transition-[width] duration-500",
                        ratio >= 0.8
                          ? "bg-emerald-500"
                          : ratio <= 0.5
                            ? "bg-rose-400"
                            : "bg-sky-500",
                      ].join(" ")}
                      style={{ width: `${Math.max(ratio * 100, 2)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-neutral-600">{item.reason}</p>
                </li>
              );
            })}
          </ul>
        </div>

        {correction.scores.deductions.length > 0 ? (
          <ul className="mt-5 space-y-1.5 border-t border-neutral-200 pt-4 text-sm">
            {correction.scores.deductions.map((deduction, index) => (
              <li key={index} className="flex gap-2">
                <span className="w-10 shrink-0 text-right font-semibold text-rose-600 tabular-nums">
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
          <div>
            <h2 className="text-lg font-bold">답안과 첨삭</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              <span className="xl:hidden">색칠한 곳을 누르면 코멘트가 아래에서 올라옵니다.</span>
              <span className="hidden xl:inline">
                색칠한 곳이나 오른쪽 코멘트를 누르면 서로 짝이 맞춰집니다.
              </span>
            </p>
          </div>

          <div className="flex rounded-lg border border-neutral-300 p-0.5 text-sm">
            {(
              [
                ["prose", "줄글"],
                ["grid", "원고지"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={[
                  "rounded-md px-3 py-1.5 transition",
                  view === value ? "bg-neutral-900 font-medium text-white" : "text-neutral-600",
                ].join(" ")}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {/* 종류별로 걸러 보기 */}
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 text-sm">
          <button
            type="button"
            onClick={() => setOnly(null)}
            className={[
              "shrink-0 rounded-full border px-3 py-1.5",
              only === null
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white",
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
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
                only === severity
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white",
              ].join(" ")}
            >
              <span className={`h-2 w-2 rounded-full ${DOT[severity]}`} />
              {SEVERITY_LABEL[severity]} {counts.get(severity)}
            </button>
          ))}
        </div>

        {/* 원고지는 38칸이라 폭이 필요해서, 그때는 목록을 아래로 내린다. */}
        <div
          className={[
            "mt-3 grid gap-5",
            view === "prose" ? "xl:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)]" : "",
          ].join(" ")}
        >
          <div
            ref={frameRef}
            className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5"
          >
            {view === "prose" ? (
              <AnswerProse
                text={answerText}
                comments={shown}
                activeIndex={activeIndex}
                onSelect={(index) => setActive(index === activeIndex ? null : index)}
              />
            ) : (
              <div className="overflow-x-auto">
                <ManuscriptGrid
                  spec={DEFAULT_SPEC}
                  rows={rows}
                  layout={layout}
                  lengthRule={lengthRule}
                  label={label}
                  issues={shown}
                  activeRange={activeComment}
                  cellSize={cellSize}
                  onMarkSelect={(index) => setActive(index === activeIndex ? null : index)}
                />
              </div>
            )}
          </div>

          {/* 코멘트 목록 — 좁은 화면에서는 시트로 대신하므로 숨긴다. */}
          <ul
            ref={listRef}
            className={[
              "hidden space-y-2 xl:block",
              view === "prose" ? "xl:max-h-[70vh] xl:overflow-y-auto xl:pr-1" : "",
            ].join(" ")}
          >
            {shown.map((comment) => {
              const severity = comment.severity as Severity;
              return (
                <li key={comment.index} data-comment={comment.index}>
                  <button
                    type="button"
                    onClick={() => setActive(comment.index === activeIndex ? null : comment.index)}
                    className={[
                      "flex w-full gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition",
                      CARD[severity],
                      activeIndex === comment.index
                        ? "ring-2 ring-neutral-900"
                        : "hover:border-neutral-400",
                    ].join(" ")}
                  >
                    <span
                      className={`shrink-0 font-bold tabular-nums ${ACCENT[severity]}`}
                    >
                      {markLabel(comment.index)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-500">
                        <span className="font-medium text-neutral-700">{comment.category}</span>
                        <span>{SEVERITY_LABEL[severity]}</span>
                        <span className="ml-auto">
                          {comment.start + 1}~{comment.end}자
                        </span>
                      </span>

                      <span className="mt-1 block border-l-2 border-neutral-300 pl-2 text-neutral-500 italic">
                        “{answerText.slice(comment.start, comment.end)}”
                      </span>

                      <span className="mt-1.5 block leading-6">{comment.message}</span>

                      {comment.suggestion ? (
                        <span className="mt-1.5 block rounded-md bg-white/80 px-2 py-1 leading-6">
                          <b className="text-neutral-500">고쳐 쓰면</b> {comment.suggestion}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 ? (
              <li className="rounded-xl border border-dashed border-neutral-300 px-3 py-6 text-center text-sm text-neutral-500">
                {comments.length === 0 ? "코멘트가 없습니다." : "이 종류의 코멘트가 없습니다."}
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      {/* ── 총평 ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">총평</h2>
        <p className="mt-2 leading-7 whitespace-pre-wrap">{correction.overall.summary}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-emerald-50/70 p-4">
            <h3 className="text-sm font-semibold text-emerald-700">잘한 점</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-6">
              {correction.overall.strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-amber-50/70 p-4">
            <h3 className="text-sm font-semibold text-amber-700">고칠 점</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-6">
              {correction.overall.improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {correction.overall.nextSteps.length > 0 ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
            <h3 className="text-sm font-semibold text-sky-800">다음 답안에서 바로 할 것</h3>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm leading-6">
              {correction.overall.nextSteps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {correction.revisedExample ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold">고쳐 쓴 예시</h2>
          <p className="mt-1 text-sm text-neutral-500">
            새로 쓴 모범답안이 아니라, 내가 쓴 답안의 논지를 살려 구성과 문장만 손본 것입니다.
          </p>
          <p className="mt-3 leading-[2.1] break-keep whitespace-pre-wrap">
            {correction.revisedExample}
          </p>
          <p className="mt-2 text-xs text-neutral-400">{correction.revisedExample.length}자</p>
        </section>
      ) : null}

      {/* 좁은 화면에서 형광펜을 누르면 올라오는 코멘트 */}
      <CommentSheet
        comments={shown}
        activeIndex={activeIndex}
        answerText={answerText}
        onSelect={setActive}
        onClose={() => setActive(null)}
      />
    </div>
  );
}
