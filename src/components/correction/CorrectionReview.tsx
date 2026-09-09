"use client";

import Link from "next/link";
import { useState } from "react";

import { CorrectionView } from "@/components/correction/CorrectionView";
import type { LengthRule } from "@/lib/manuscript/spec";
import { totalScore, type Correction } from "@/lib/types/work";

interface Props {
  initial: Correction;
  answerText: string;
  lengthRule: LengthRule | null;
  label?: string;
  studentName: string;
}

export function CorrectionReview({ initial, answerText, lengthRule, label, studentName }: Props) {
  const [correction, setCorrection] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const total = totalScore(correction.scores);

  async function save(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/corrections/${correction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setCorrection(data.correction);
      setNote(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="text-sm">
          <span className="font-medium">{studentName}</span>
          <span className="ml-2 text-neutral-500">{total}점</span>
          {correction.teacherEdited ? (
            <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
              선생님이 고침
            </span>
          ) : null}
          {correction.published ? (
            <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-xs text-white">
              학생에게 공개됨
            </span>
          ) : (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
              아직 학생은 볼 수 없음
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={`/print/correction/${correction.id}`}
            target="_blank"
            className="rounded-md border border-neutral-300 px-3 py-1.5"
          >
            인쇄
          </Link>
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="rounded-md border border-neutral-300 px-3 py-1.5"
          >
            {editing ? "편집 닫기" : "점수 · 코멘트 고치기"}
          </button>
          <button
            type="button"
            onClick={() =>
              void save(
                { published: !correction.published },
                correction.published
                  ? "공개를 내렸습니다. 학생은 더 이상 볼 수 없습니다."
                  : "학생에게 공개했습니다.",
              )
            }
            disabled={busy}
            className={[
              "rounded-md px-3 py-1.5 font-medium disabled:opacity-40",
              correction.published
                ? "border border-neutral-300"
                : "bg-neutral-900 text-white",
            ].join(" ")}
          >
            {correction.published ? "공개 내리기" : "학생에게 공개"}
          </button>
        </div>
      </div>

      {note ? <p className="mb-4 text-sm text-emerald-700">{note}</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {editing ? (
        <section className="mb-8 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
          <h2 className="font-semibold">점수 고치기</h2>
          <ul className="mt-3 space-y-3">
            {correction.scores.items.map((item, index) => (
              <li key={item.id} className="flex flex-wrap items-start gap-2">
                <span className="w-44 shrink-0 pt-2 text-sm font-medium">{item.name}</span>
                <input
                  value={item.awarded}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      scores: {
                        ...correction.scores,
                        items: correction.scores.items.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                awarded: Math.max(
                                  0,
                                  Math.min(Number(event.target.value) || 0, row.points),
                                ),
                              }
                            : row,
                        ),
                      },
                    })
                  }
                  inputMode="numeric"
                  className="w-16 rounded-md border border-neutral-300 px-2 py-2 text-center text-sm"
                />
                <span className="pt-2 text-sm text-neutral-400">/ {item.points}</span>
                <textarea
                  value={item.reason}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      scores: {
                        ...correction.scores,
                        items: correction.scores.items.map((row, i) =>
                          i === index ? { ...row, reason: event.target.value } : row,
                        ),
                      },
                    })
                  }
                  rows={2}
                  className="min-w-56 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </li>
            ))}
          </ul>

          <h2 className="mt-6 font-semibold">총평 고치기</h2>
          <textarea
            value={correction.overall.summary}
            onChange={(event) =>
              setCorrection({
                ...correction,
                overall: { ...correction.overall, summary: event.target.value },
              })
            }
            rows={4}
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />

          <h2 className="mt-6 font-semibold">코멘트 고치기</h2>
          <ul className="mt-2 space-y-2">
            {correction.inlineComments.map((comment, index) => (
              <li key={index} className="flex flex-wrap items-start gap-2">
                <select
                  value={comment.severity}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      inlineComments: correction.inlineComments.map((row, i) =>
                        i === index
                          ? { ...row, severity: event.target.value as typeof row.severity }
                          : row,
                      ),
                    })
                  }
                  className="w-24 rounded-md border border-neutral-300 px-2 py-2 text-sm"
                >
                  <option value="good">좋음</option>
                  <option value="info">참고</option>
                  <option value="warning">고칠 점</option>
                  <option value="error">문제</option>
                </select>
                <textarea
                  value={comment.message}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      inlineComments: correction.inlineComments.map((row, i) =>
                        i === index ? { ...row, message: event.target.value } : row,
                      ),
                    })
                  }
                  rows={2}
                  className="min-w-56 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCorrection({
                      ...correction,
                      inlineComments: correction.inlineComments.filter((_, i) => i !== index),
                    })
                  }
                  className="rounded-md border border-neutral-300 px-2 py-2 text-xs text-neutral-500"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() =>
              void save(
                {
                  scores: {
                    items: correction.scores.items,
                    deductions: correction.scores.deductions,
                  },
                  inlineComments: correction.inlineComments,
                  overall: correction.overall,
                },
                "고친 내용을 저장했습니다.",
              )
            }
            disabled={busy}
            className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "저장 중…" : "고친 내용 저장"}
          </button>
        </section>
      ) : null}

      <CorrectionView
        correction={correction}
        answerText={answerText}
        lengthRule={lengthRule}
        label={label}
      />
    </div>
  );
}
