"use client";

import { useState } from "react";

import { lengthRange } from "@/lib/manuscript/spec";
import type { Question } from "@/lib/types/exam";

interface Props {
  univId: string;
  examId: string;
  initial: Question[];
  onSaved: (questions: Question[]) => void;
}

function blankQuestion(index: number): Question {
  return {
    id: `q${index + 1}`,
    number: String(index + 1),
    prompt: "",
    passages: [],
    charTarget: null,
    tolerance: 0.1,
    lengthNote: null,
    points: null,
    answerFormat: "manuscript",
    modelAnswer: null,
    source: "manual",
  };
}

const inputClass = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

export function QuestionEditor({ univId, examId, initial, onSaved }: Props) {
  const [questions, setQuestions] = useState<Question[]>(initial);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const base = `/api/universities/${univId}/exams/${examId}`;

  function update(index: number, patch: Partial<Question>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  async function parse() {
    if (
      questions.length > 0 &&
      !confirm("파싱 결과로 화면의 문항을 덮어씁니다. 저장은 따로 눌러야 반영됩니다. 계속할까요?")
    ) {
      return;
    }
    setParsing(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(`${base}/parse-questions`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "문항 파싱에 실패했습니다.");
      setQuestions(data.questions ?? []);
      setNote(
        data.note
          ? `${data.note} (입력 ${data.usage.inputTokens.toLocaleString()} · 출력 ${data.usage.outputTokens.toLocaleString()} 토큰)`
          : `문항 ${data.questions.length}개를 찾았습니다. 확인 후 저장하세요.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 파싱에 실패했습니다.");
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${base}/questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setQuestions(data.questions ?? []);
      onSaved(data.questions ?? []);
      setNote("저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">문항 {questions.length}개</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void parse()}
            disabled={parsing}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {parsing ? "파싱 중…" : "PDF 에서 문항 뽑기"}
          </button>
          <button
            type="button"
            onClick={() => setQuestions((prev) => [...prev, blankQuestion(prev.length)])}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            직접 추가
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중…" : "문항 저장"}
          </button>
        </div>
      </div>

      {note ? <p className="mt-2 text-sm text-neutral-600">{note}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 space-y-4">
        {questions.map((question, index) => {
          const range = question.charTarget
            ? lengthRange({ target: question.charTarget, tolerance: question.tolerance })
            : null;

          return (
            <details key={question.id} className="rounded-md border border-neutral-200" open={index === 0}>
              <summary className="cursor-pointer px-3 py-2 text-sm">
                <span className="font-medium">{question.number || "?"}번</span>
                <span className="ml-2 text-neutral-500">
                  {question.prompt.slice(0, 40) || "(논제 없음)"}
                </span>
                {range ? (
                  <span className="ml-2 text-xs text-neutral-400">
                    {range.min}~{range.max}자
                  </span>
                ) : null}
                {question.source === "parsed" ? (
                  <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">
                    자동
                  </span>
                ) : null}
              </summary>

              <div className="space-y-3 border-t border-neutral-200 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="text-sm">
                    <span className="text-xs text-neutral-500">문항 번호</span>
                    <input
                      value={question.number}
                      onChange={(event) => update(index, { number: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-xs text-neutral-500">글자 수</span>
                    <input
                      value={question.charTarget ?? ""}
                      onChange={(event) =>
                        update(index, {
                          charTarget: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      inputMode="numeric"
                      placeholder="600"
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-xs text-neutral-500">허용 오차</span>
                    <select
                      value={question.tolerance}
                      onChange={(event) => update(index, { tolerance: Number(event.target.value) })}
                      className={inputClass}
                    >
                      <option value={0.05}>±5%</option>
                      <option value={0.1}>±10%</option>
                      <option value={0.15}>±15%</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="text-xs text-neutral-500">배점</span>
                    <input
                      value={question.points ?? ""}
                      onChange={(event) =>
                        update(index, {
                          points: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="block text-sm">
                  <span className="text-xs text-neutral-500">분량 조건 문구</span>
                  <input
                    value={question.lengthNote ?? ""}
                    onChange={(event) => update(index, { lengthNote: event.target.value || null })}
                    placeholder="600자 내외 (±10%)"
                    className={inputClass}
                  />
                </label>

                <label className="block text-sm">
                  <span className="text-xs text-neutral-500">논제</span>
                  <textarea
                    value={question.prompt}
                    onChange={(event) => update(index, { prompt: event.target.value })}
                    rows={4}
                    className={`${inputClass} font-normal`}
                  />
                </label>

                <div>
                  <span className="text-xs text-neutral-500">제시문 {question.passages.length}개</span>
                  <div className="mt-1 space-y-2">
                    {question.passages.map((passage, pi) => (
                      <div key={pi} className="flex gap-2">
                        <input
                          value={passage.label}
                          onChange={(event) =>
                            update(index, {
                              passages: question.passages.map((p, i) =>
                                i === pi ? { ...p, label: event.target.value } : p,
                              ),
                            })
                          }
                          className="w-14 rounded-md border border-neutral-300 px-2 py-2 text-center text-sm"
                        />
                        <textarea
                          value={passage.text}
                          onChange={(event) =>
                            update(index, {
                              passages: question.passages.map((p, i) =>
                                i === pi ? { ...p, text: event.target.value } : p,
                              ),
                            })
                          }
                          rows={3}
                          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            update(index, {
                              passages: question.passages.filter((_, i) => i !== pi),
                            })
                          }
                          className="self-start rounded-md border border-neutral-300 px-2 py-2 text-xs text-neutral-500"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        update(index, {
                          passages: [...question.passages, { label: "", text: "" }],
                        })
                      }
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs"
                    >
                      제시문 추가
                    </button>
                  </div>
                </div>

                <label className="block text-sm">
                  <span className="text-xs text-neutral-500">모범답안 (있으면)</span>
                  <textarea
                    value={question.modelAnswer ?? ""}
                    onChange={(event) => update(index, { modelAnswer: event.target.value || null })}
                    rows={4}
                    className={inputClass}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600"
                >
                  이 문항 삭제
                </button>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
