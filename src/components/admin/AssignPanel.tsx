"use client";

import { useState } from "react";

import type { Question } from "@/lib/types/exam";
import type { StudentRow } from "@/lib/types/work";

interface Props {
  univId: string;
  examId: string;
  questions: Question[];
  students: StudentRow[];
  analysisConfirmed: boolean;
}

export function AssignPanel({ univId, examId, questions, students, analysisConfirmed }: Props) {
  const active = students.filter((student) => student.active);
  const [questionId, setQuestionId] = useState(questions[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function assign() {
    if (!questionId || picked.length === 0) {
      setError("문항과 학생을 고르세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: picked,
          univId,
          examId,
          questionId,
          dueAt: dueAt || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "배정에 실패했습니다.");
      setPicked([]);
      setResult(
        [
          `${data.created}명에게 내줬습니다.`,
          data.skipped.length ? `이미 받은 학생은 건너뜀: ${data.skipped.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "배정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h3 className="font-semibold">학생에게 내주기</h3>

      {questions.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">문항을 먼저 저장하세요.</p>
      ) : active.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          아직 학생이 없습니다. 관리 홈에서 초대 코드를 발급하세요.
        </p>
      ) : (
        <>
          {!analysisConfirmed ? (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              채점 기준이 아직 확정되지 않았습니다. 지금 내줘도 되지만, 첨삭은 확정한 뒤에야
              돌릴 수 있습니다.
            </p>
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-xs text-neutral-500">문항</span>
              <select
                value={questionId}
                onChange={(event) => setQuestionId(event.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {questions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.number}번
                    {question.charTarget ? ` · ${question.charTarget}자` : ""} ·{" "}
                    {question.prompt.slice(0, 30)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-neutral-500">마감일 (없으면 비움)</span>
              <input
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">학생 {picked.length}명 선택</span>
              <button
                type="button"
                onClick={() =>
                  setPicked(
                    picked.length === active.length ? [] : active.map((student) => student.uid),
                  )
                }
                className="text-xs text-neutral-500 underline-offset-4 hover:underline"
              >
                {picked.length === active.length ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {active.map((student) => {
                const on = picked.includes(student.uid);
                return (
                  <button
                    key={student.uid}
                    type="button"
                    onClick={() =>
                      setPicked(
                        on
                          ? picked.filter((uid) => uid !== student.uid)
                          : [...picked, student.uid],
                      )
                    }
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm",
                      on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
                    ].join(" ")}
                  >
                    {student.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void assign()}
            disabled={busy || picked.length === 0}
            className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "내주는 중…" : "내주기"}
          </button>
        </>
      )}

      {result ? <p className="mt-3 text-sm text-emerald-700">{result}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
