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
  /** 선생님 본인 uid — 자기에게 내서 직접 풀어 볼 수 있게 한다 */
  teacherUid: string;
}

export function AssignPanel({
  univId,
  examId,
  questions,
  students,
  analysisConfirmed,
  teacherUid,
}: Props) {
  const active = students.filter((student) => student.active);
  const [picked, setPicked] = useState<string[]>([]);
  /** 내줄 문항. 기본은 전부 */
  const [chosen, setChosen] = useState<string[]>(() => questions.map((question) => question.id));
  // 문항 목록이 바뀌면(새로 저장) 없는 문항은 뺀다
  const chosenIds = chosen.filter((id) => questions.some((question) => question.id === id));
  const allChosen = chosenIds.length === questions.length;
  const chosenLabel = questions
    .filter((question) => chosenIds.includes(question.id))
    .map((question) => `${question.number}번`)
    .join(", ");
  const [dueAt, setDueAt] = useState("");
  /**
   * 학생에게 보일 문제지 이름.
   * 어느 대학 몇 학년도인지 알면 학생이 인터넷에서 해설을 찾아 베낀다.
   */
  const [paperName, setPaperName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function send(studentIds: string[]): Promise<{ created: number; skipped: string[] } | null> {
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentIds,
        univId,
        examId,
        dueAt: dueAt || null,
        paperName: paperName.trim() || null,
        // 전부 고르면 보내지 않는다 — 시험지 통째로 나간다.
        questionIds: allChosen ? undefined : chosenIds,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "배정에 실패했습니다.");
    return data;
  }

  async function assign() {
    if (picked.length === 0) {
      setError("학생을 고르세요.");
      return;
    }
    if (chosenIds.length === 0) {
      setError("내줄 문항을 고르세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await send(picked);
      setPicked([]);
      setResult(
        [
          allChosen
            ? `${data!.created}명에게 문항 ${questions.length}개를 통째로 내줬습니다.`
            : `${data!.created}명에게 ${chosenLabel} 을 내줬습니다.`,
          data!.skipped.length ? `이미 받은 학생은 건너뜀: ${data!.skipped.join(", ")}` : "",
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

  /** 선생님이 직접 풀어 본다 — 학생과 같은 화면에서 쓰고 첨삭까지 돌려 볼 수 있다. */
  async function practice() {
    if (chosenIds.length === 0) {
      setError("내줄 문항을 고르세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await send([teacherUid]);
      setResult(
        data!.created > 0
          ? `내 과제로 넣었습니다 (${allChosen ? `문항 ${questions.length}개` : chosenLabel}). '과제 · 첨삭' 에서 '내가 푼 것' 을 누르면 풀 수 있습니다.`
          : "이미 내 과제에 있습니다. '과제 · 첨삭' 에서 이어 쓰거나, 지우고 다시 넣으세요.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h3 className="font-semibold">학생에게 내주기</h3>

      {questions.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">문항을 먼저 저장하세요.</p>
      ) : (
        <>
          {!analysisConfirmed ? (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              채점 기준이 아직 확정되지 않았습니다. 지금 내줘도 되지만, 첨삭은 확정한 뒤에야
              돌릴 수 있습니다.
            </p>
          ) : null}

          <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-neutral-500">
                내줄 문항을 고르세요. 고른 문항이 한 과제로 함께 나가고, 학생은 전부 쓴 뒤
                한꺼번에 냅니다. 학생이 이미 받은 문항은 다시 나가지 않습니다.
              </p>
              <button
                type="button"
                onClick={() => setChosen(allChosen ? [] : questions.map((question) => question.id))}
                className="shrink-0 text-xs text-neutral-500 underline-offset-4 hover:underline"
              >
                {allChosen ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {questions.map((question) => (
                <li key={question.id}>
                  <label className="flex cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      checked={chosenIds.includes(question.id)}
                      onChange={(event) =>
                        setChosen(
                          event.target.checked
                            ? [...chosenIds, question.id]
                            : chosenIds.filter((id) => id !== question.id),
                        )
                      }
                    />
                    <span className="w-10 shrink-0 font-medium">{question.number}번</span>
                    <span className="text-neutral-500">
                      {question.charTarget ? `${question.charTarget}자 내외` : "분량 조건 없음"}
                    </span>
                    <span className="truncate text-neutral-600">
                      {question.prompt.slice(0, 40)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-xs text-neutral-500">
                학생에게 보일 이름
              </span>
              <input
                value={paperName}
                onChange={(event) => setPaperName(event.target.value)}
                maxLength={60}
                placeholder="예) 모의논술 1회"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
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

          <p
            className={[
              "mt-1.5 rounded-md px-2.5 py-1.5 text-xs leading-5",
              paperName.trim() ? "text-neutral-500" : "bg-amber-50 text-amber-800",
            ].join(" ")}
          >
            {paperName.trim() ? (
              <>
                학생 화면과 인쇄물에는 <b>{paperName.trim()}</b> 만 나갑니다. 대학과 학년도는
                선생님 화면에만 보입니다.
              </>
            ) : (
              <>
                비워 두면 대학과 학년도가 학생에게 그대로 나갑니다. 그걸 알면 인터넷에서
                해설을 찾아 베낄 수 있습니다.
              </>
            )}
          </p>

          {active.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              아직 받아들인 학생이 없습니다. 학생이 가입 신청하면 ‘학생’ 화면에서 받아 줍니다. 그 전에도 아래에서
              직접 풀어 보실 수 있습니다.
            </p>
          ) : (
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

          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {active.length > 0 ? (
              <button
                type="button"
                onClick={() => void assign()}
                disabled={busy || picked.length === 0 || chosenIds.length === 0}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? "내주는 중…" : "내주기"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void practice()}
              disabled={busy}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
              title="학생과 같은 화면에서 직접 써 보고 첨삭까지 돌려 볼 수 있습니다."
            >
              내가 직접 풀어보기
            </button>
          </div>
        </>
      )}

      {result ? <p className="mt-3 text-sm text-emerald-700">{result}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
