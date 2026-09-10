"use client";

import { useState } from "react";

import { ManualRun } from "@/components/admin/ManualRun";
import {
  RUBRIC_TOTAL,
  rubricTotalsByQuestion,
  type Analysis,
  type RubricItem,
} from "@/lib/types/exam";

interface Props {
  univId: string;
  examId: string;
  initial: Analysis | null;
  onStatus: (status: Analysis["status"]) => void;
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

/** 해설에 없어 추론한 항목임을 눈에 띄게 표시한다. */
function InferredBadge({ inferred }: { inferred: boolean }) {
  if (!inferred) return null;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700" title="해설에 명시되지 않아 모범답안에서 추론한 항목">
      추론
    </span>
  );
}

export function RubricEditor({ univId, examId, initial, onStatus }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(initial);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const examBase = `/api/universities/${univId}/exams/${examId}`;
  const analysisBase = `/api/universities/${univId}/analyses/${examId}`;

  // 학생은 문항 하나씩 답안을 쓰므로 문항마다 100점이어야 한다.
  const totals = analysis ? rubricTotalsByQuestion(analysis.rubric.items) : new Map<string, number>();
  const allHundred = totals.size > 0 && [...totals.values()].every((v) => v === RUBRIC_TOTAL);
  const confirmed = analysis?.status === "confirmed";

  function patchLocal(patch: Partial<Analysis>) {
    setAnalysis((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateItem(index: number, patch: Partial<RubricItem>) {
    if (!analysis) return;
    patchLocal({
      rubric: {
        ...analysis.rubric,
        items: analysis.rubric.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      },
    });
  }

  async function analyze() {
    setRunning(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(`${examBase}/analyze`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "분석에 실패했습니다.");
      setAnalysis(data.analysis);
      onStatus("draft");
      const usage = data.analysis.usage;
      setNote(
        usage
          ? `초안을 만들었습니다. ${usage.model} · 입력 ${usage.inputTokens.toLocaleString()} · 출력 ${usage.outputTokens.toLocaleString()} 토큰`
          : "초안을 만들었습니다.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "분석에 실패했습니다.");
    } finally {
      setRunning(false);
    }
  }

  async function save(status?: Analysis["status"]) {
    if (!analysis) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(analysisBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionTypes: analysis.questionTypes,
          rubric: analysis.rubric,
          answerStyle: analysis.answerStyle,
          modelAnswerPatterns: analysis.modelAnswerPatterns,
          ...(status ? { status } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setAnalysis(data.analysis);
      onStatus(data.analysis.status);
      setNote(
        data.analysis.status === "confirmed"
          ? "확정했습니다. 이제부터 첨삭은 이 기준을 씁니다."
          : "저장했습니다.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          채점 기준
          {analysis ? (
            <span
              className={
                confirmed
                  ? "ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700"
                  : "ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700"
              }
            >
              {confirmed ? "확정" : "초안"} v{analysis.version}
            </span>
          ) : null}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={running || confirmed}
            title={
              confirmed
                ? "확정을 먼저 풀어야 다시 분석할 수 있습니다."
                : "Claude API 로 돌립니다. 기출 하나에 요금이 듭니다."
            }
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-40"
          >
            {running ? "분석 중…" : analysis ? "다시 분석" : "채점 기준 분석"}
          </button>
          <button
            type="button"
            onClick={() => setManual(!manual)}
            disabled={confirmed}
            title="프롬프트를 복사해 내 Claude 구독으로 돌리고 결과만 붙여 넣습니다. 요금이 들지 않습니다."
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-40"
          >
            직접 분석
          </button>
          {analysis ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => void save(confirmed ? "draft" : "confirmed")}
                disabled={saving || (!confirmed && !allHundred)}
                title={
                  !confirmed && !allHundred
                    ? "문항마다 배점 합계가 100점이어야 확정할 수 있습니다."
                    : undefined
                }
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {confirmed ? "확정 풀기" : "확정"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {manual ? (
        <ManualRun
          title="직접 채점 기준 분석"
          promptUrl={`${examBase}/analyze/prompt`}
          submitUrl={`${examBase}/analyze/manual`}
          onClose={() => setManual(false)}
          onDone={(data) => {
            const next = data.analysis as Analysis;
            setAnalysis(next);
            onStatus("draft");
            setManual(false);
            setNote(`초안을 넣었습니다. 배점 항목 ${next.rubric.items.length}개.`);
          }}
        />
      ) : null}

      {note ? <p className="mt-2 text-sm text-neutral-600">{note}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {!analysis ? (
        <p className="mt-3 text-sm text-neutral-500">
          문제 PDF 텍스트 추출을 마친 뒤 분석을 돌리세요. 해설 PDF 가 있으면 함께 씁니다.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">배점 항목</h4>
              <div className="flex flex-wrap gap-2 text-sm">
                {[...totals].map(([number, sum]) => (
                  <span
                    key={number}
                    className={
                      sum === RUBRIC_TOTAL
                        ? "text-neutral-500"
                        : "font-medium text-red-600"
                    }
                  >
                    {number ? `${number}번` : "전체"} {sum} / {RUBRIC_TOTAL}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              학생은 문항 하나씩 답안을 쓰므로, 문항마다 100점이 되어야 확정할 수 있습니다.
            </p>

            <div className="mt-2 space-y-3">
              {analysis.rubric.items.map((item, index) => (
                <div key={item.id} className="rounded-md border border-neutral-200 p-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={item.questionNumber ?? ""}
                      onChange={(event) =>
                        updateItem(index, { questionNumber: event.target.value || null })
                      }
                      placeholder="문항"
                      title="이 항목이 어느 문항의 것인지"
                      className="w-16 rounded-md border border-neutral-300 px-2 py-2 text-center text-sm"
                    />
                    <input
                      value={item.name}
                      onChange={(event) => updateItem(index, { name: event.target.value })}
                      className="min-w-40 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium"
                    />
                    <input
                      value={item.points}
                      onChange={(event) => updateItem(index, { points: Number(event.target.value) || 0 })}
                      inputMode="numeric"
                      className="w-20 rounded-md border border-neutral-300 px-3 py-2 text-center text-sm"
                    />
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      <input
                        type="checkbox"
                        checked={item.inferred}
                        onChange={(event) => updateItem(index, { inferred: event.target.checked })}
                      />
                      추론
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        patchLocal({
                          rubric: {
                            ...analysis.rubric,
                            items: analysis.rubric.items.filter((_, i) => i !== index),
                          },
                        })
                      }
                      className="rounded-md border border-neutral-300 px-2 text-xs text-neutral-500"
                    >
                      삭제
                    </button>
                  </div>
                  <textarea
                    value={item.description}
                    onChange={(event) => updateItem(index, { description: event.target.value })}
                    rows={2}
                    className={`${inputClass} mt-2`}
                  />
                  <textarea
                    value={item.criteria.join("\n")}
                    onChange={(event) =>
                      updateItem(index, {
                        criteria: event.target.value.split("\n").filter((line) => line.trim()),
                      })
                    }
                    rows={3}
                    placeholder="만점 조건 — 한 줄에 하나"
                    className={`${inputClass} mt-2`}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  patchLocal({
                    rubric: {
                      ...analysis.rubric,
                      items: [
                        ...analysis.rubric.items,
                        {
                          id: `r${analysis.rubric.items.length + 1}-${Date.now()}`,
                          questionNumber: analysis.rubric.items.at(-1)?.questionNumber ?? null,
                          name: "",
                          points: 0,
                          description: "",
                          criteria: [],
                          inferred: false,
                        },
                      ],
                    },
                  })
                }
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs"
              >
                항목 추가
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold">감점</h4>
            <ul className="mt-2 space-y-2">
              {analysis.rubric.deductions.map((deduction, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="w-14 shrink-0 text-right font-medium text-red-600">
                    −{deduction.points}
                  </span>
                  <div>
                    <span className="font-medium">{deduction.name}</span>{" "}
                    <InferredBadge inferred={deduction.inferred} />
                    <p className="text-neutral-600">{deduction.description}</p>
                  </div>
                </li>
              ))}
              {analysis.rubric.deductions.length === 0 ? (
                <li className="text-sm text-neutral-500">없음</li>
              ) : null}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">문항 유형</h4>
            <ul className="mt-2 space-y-2 text-sm">
              {analysis.questionTypes.map((type, index) => (
                <li key={index}>
                  <span className="font-medium">{type.name}</span>
                  <p className="text-neutral-600">{type.description}</p>
                  {type.cues.length > 0 ? (
                    <p className="text-xs text-neutral-400">지시어: {type.cues.join(" · ")}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs text-neutral-500">글의 구성</span>
              <textarea
                value={analysis.answerStyle.structure}
                onChange={(event) =>
                  patchLocal({
                    answerStyle: { ...analysis.answerStyle, structure: event.target.value },
                  })
                }
                rows={4}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-neutral-500">문체</span>
              <textarea
                value={analysis.answerStyle.tone}
                onChange={(event) =>
                  patchLocal({ answerStyle: { ...analysis.answerStyle, tone: event.target.value } })
                }
                rows={4}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>

          <div>
            <h4 className="text-sm font-semibold">피해야 할 것</h4>
            <ul className="mt-1 list-disc pl-5 text-sm text-neutral-700">
              {analysis.answerStyle.avoid.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">모범답안에서 보이는 서술 방식</h4>
            <ul className="mt-1 list-disc pl-5 text-sm text-neutral-700">
              {analysis.modelAnswerPatterns.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
