"use client";

import { useMemo, useState } from "react";

import { ManuscriptGrid } from "@/components/manuscript/ManuscriptGrid";
import { layoutManuscript } from "@/lib/manuscript/layout";
import { DEFAULT_SPEC, planRows, type LengthRule } from "@/lib/manuscript/spec";
import { SEVERITY_LABEL, totalScore, type Correction } from "@/lib/types/work";

const SEVERITY_CLASS: Record<string, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-neutral-200 bg-neutral-50 text-neutral-700",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

const SEVERITY_DOT: Record<string, string> = {
  good: "bg-emerald-500",
  info: "bg-neutral-400",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

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

  const layout = useMemo(() => layoutManuscript(answerText, DEFAULT_SPEC), [answerText]);
  const rows = useMemo(() => {
    const planned = lengthRule
      ? planRows(DEFAULT_SPEC, lengthRule)
      : layout.usedRows + DEFAULT_SPEC.extraLines;
    return Math.max(planned, layout.usedRows + 1);
  }, [layout.usedRows, lengthRule]);

  const total = totalScore(correction.scores);
  const activeComment = active === null ? null : (correction.inlineComments[active] ?? null);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-neutral-200 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">점수</h2>
          <p className="text-2xl font-bold">
            {total}
            <span className="ml-1 text-base font-normal text-neutral-400">/ 100</span>
          </p>
        </div>

        <ul className="mt-4 space-y-3">
          {correction.scores.items.map((item) => (
            <li key={item.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <span className="shrink-0 tabular-nums">
                  <span
                    className={
                      item.awarded >= item.points * 0.8
                        ? "text-emerald-700"
                        : item.awarded <= item.points * 0.5
                          ? "text-red-600"
                          : ""
                    }
                  >
                    {item.awarded}
                  </span>
                  <span className="text-neutral-400"> / {item.points}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded bg-neutral-100">
                <div
                  className="h-1.5 rounded bg-neutral-800"
                  style={{ width: `${item.points ? (item.awarded / item.points) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1 text-sm text-neutral-600">{item.reason}</p>
            </li>
          ))}
        </ul>

        {correction.scores.deductions.length > 0 ? (
          <ul className="mt-4 space-y-1 border-t border-neutral-200 pt-3 text-sm">
            {correction.scores.deductions.map((deduction, index) => (
              <li key={index} className="flex gap-2">
                <span className="w-12 shrink-0 text-right font-medium text-red-600">
                  −{deduction.points}
                </span>
                <span>
                  <span className="font-medium">{deduction.name}</span> — {deduction.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold">답안과 첨삭</h2>
        <p className="mt-1 text-sm text-neutral-500">
          오른쪽 코멘트를 누르면 답안의 해당 부분이 표시됩니다.
        </p>

        <div className="mt-3 grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="overflow-x-auto">
            <ManuscriptGrid
              spec={DEFAULT_SPEC}
              rows={rows}
              layout={layout}
              lengthRule={lengthRule}
              label={label}
              issues={correction.inlineComments}
              activeRange={activeComment}
            />
          </div>

          <ul className="space-y-2">
            {correction.inlineComments.map((comment, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => setActive(active === index ? null : index)}
                  className={[
                    "w-full rounded-md border px-3 py-2 text-left text-sm",
                    SEVERITY_CLASS[comment.severity],
                    active === index ? "ring-2 ring-neutral-900" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[comment.severity]}`} />
                    <span className="font-medium">{comment.category}</span>
                    <span className="text-neutral-500">{SEVERITY_LABEL[comment.severity]}</span>
                    <span className="ml-auto text-neutral-400">
                      {comment.start + 1}~{comment.end}자
                    </span>
                  </div>
                  <p className="mt-1">{comment.message}</p>
                  {comment.suggestion ? (
                    <p className="mt-1 rounded bg-white/70 px-2 py-1 text-neutral-800">
                      고쳐 쓰면 → {comment.suggestion}
                    </p>
                  ) : null}
                  {active === index ? (
                    <p className="mt-1 border-t border-current/10 pt-1 text-xs text-neutral-600">
                      원문: {answerText.slice(comment.start, comment.end)}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
            {correction.inlineComments.length === 0 ? (
              <li className="text-sm text-neutral-500">코멘트가 없습니다.</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="text-lg font-semibold">총평</h2>
        <p className="mt-2 whitespace-pre-wrap">{correction.overall.summary}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-emerald-700">잘한 점</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {correction.overall.strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-700">고칠 점</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {correction.overall.improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {correction.overall.nextSteps.length > 0 ? (
          <div className="mt-4 rounded-md bg-neutral-50 p-3">
            <h3 className="text-sm font-semibold">다음 답안에서 바로 할 것</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
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
          <p className="mt-3 leading-8 whitespace-pre-wrap">{correction.revisedExample}</p>
          <p className="mt-2 text-xs text-neutral-400">
            {correction.revisedExample.length}자
          </p>
        </section>
      ) : null}
    </div>
  );
}
