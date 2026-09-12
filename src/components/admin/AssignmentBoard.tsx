"use client";

import Link from "next/link";
import { useState } from "react";

import { ManualRun } from "@/components/admin/ManualRun";
import {
  ASSIGNMENT_LABEL,
  totalScore,
  type Assignment,
  type Correction,
} from "@/lib/types/work";

const STATUS_CLASS: Record<Assignment["status"], string> = {
  assigned: "bg-neutral-100 text-neutral-600",
  writing: "bg-sky-100 text-sky-700",
  submitted: "bg-amber-100 text-amber-800",
  correcting: "bg-violet-100 text-violet-700",
  corrected: "bg-emerald-100 text-emerald-700",
  published: "bg-emerald-600 text-white",
};

/** 과제 한 줄에 딸린 문항별 상태. 서버에서 만들어 넘긴다. */
export interface BoardQuestion {
  questionId: string;
  number: string;
  charCount: number;
  submitted: boolean;
  correctionStatus: Correction["status"] | null;
  score: number | null;
}

export interface BoardRow {
  assignment: Assignment;
  questions: BoardQuestion[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function questionLine(question: BoardQuestion): string {
  if (question.correctionStatus === "done") return `${question.score}점`;
  if (question.correctionStatus === "error") return "첨삭 실패";
  if (question.correctionStatus === "running" || question.correctionStatus === "queued") {
    return "첨삭 중";
  }
  if (question.submitted) return `제출 ${question.charCount}자`;
  return question.charCount > 0 ? `쓰는 중 ${question.charCount}자` : "시작 전";
}

export function AssignmentBoard({ initial }: { initial: BoardRow[] }) {
  const [rows, setRows] = useState<BoardRow[]>(initial);
  const [filter, setFilter] = useState<"all" | "todo" | "done" | "mine">("all");
  const [running, setRunning] = useState<string | null>(null);
  const [manual, setManual] = useState<{ assignmentId: string; questionId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = rows.filter(({ assignment }) => {
    if (filter === "todo") return assignment.status === "submitted";
    if (filter === "done") {
      return assignment.status === "corrected" || assignment.status === "published";
    }
    if (filter === "mine") return assignment.selfPractice;
    return true;
  });
  const waiting = rows.filter((row) => row.assignment.status === "submitted").length;
  const mine = rows.filter((row) => row.assignment.selfPractice).length;

  function applyCorrections(assignmentId: string, corrections: Correction[]) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.assignment.id !== assignmentId) return row;
        const questions = row.questions.map((question) => {
          const found = corrections.find((one) => one.questionId === question.questionId);
          if (!found) return question;
          return {
            ...question,
            correctionStatus: found.status,
            score: found.status === "done" ? totalScore(found.scores) : null,
          };
        });
        const allDone = questions.every((q) => q.correctionStatus === "done");
        const anyRunning = questions.some(
          (q) => q.correctionStatus === "running" || q.correctionStatus === "queued",
        );
        return {
          questions,
          assignment: {
            ...row.assignment,
            status: allDone ? "corrected" : anyRunning ? "correcting" : row.assignment.status,
          },
        };
      }),
    );
  }

  /** 첨삭은 문항마다 1~3분씩 걸린다. 서버가 끝낼 때까지 상태를 물어 본다. */
  async function waitFor(assignmentId: string, count: number): Promise<Correction[]> {
    const deadline = Date.now() + (6 + 6 * count) * 60 * 1000;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const response = await fetch(`/api/assignments/${assignmentId}/corrections`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "상태를 확인하지 못했습니다.");

      const corrections: Correction[] = data.corrections ?? [];
      applyCorrections(assignmentId, corrections);

      const failed = corrections.find((one) => one.status === "error");
      if (failed) throw new Error(failed.error ?? "첨삭에 실패했습니다.");
      if (corrections.length >= count && corrections.every((one) => one.status === "done")) {
        return corrections;
      }
      if (Date.now() > deadline) {
        throw new Error("시간이 너무 오래 걸립니다. 잠시 뒤 새로고침해서 확인해 주세요.");
      }
    }
  }

  async function correct(row: BoardRow) {
    setRunning(row.assignment.id);
    setError(null);
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: row.assignment.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "첨삭에 실패했습니다.");

      await waitFor(row.assignment.id, row.questions.length);
    } catch (caught) {
      setError(
        `${row.assignment.studentName} · ${caught instanceof Error ? caught.message : "첨삭에 실패했습니다."}`,
      );
    } finally {
      setRunning(null);
    }
  }

  async function revoke(row: BoardRow) {
    const { assignment } = row;
    const message = assignment.selfPractice
      ? "내 연습 과제를 지울까요? 쓴 답안과 첨삭 결과가 함께 지워집니다."
      : `${assignment.studentName} 의 과제를 회수할까요? 학생이 쓴 답안과 첨삭 결과가 함께 지워집니다.`;
    if (!confirm(message)) return;

    const response = await fetch(`/api/assignments/${assignment.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "회수에 실패했습니다.");
      return;
    }
    setRows((prev) => prev.filter((one) => one.assignment.id !== assignment.id));
  }

  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
        아직 내준 과제가 없습니다. 기출 화면에서 시험지를 학생에게 내주세요.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            ["all", `전체 ${rows.length}`],
            ["todo", `첨삭 대기 ${waiting}`],
            ["done", "첨삭 완료"],
            ...(mine > 0 ? ([["mine", `내가 푼 것 ${mine}`]] as const) : []),
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={[
              "rounded-full border px-3 py-1.5",
              filter === key ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {shown.map((row) => {
          const { assignment, questions } = row;
          const corrected = questions.filter((q) => q.correctionStatus === "done").length;
          const manualHere = manual?.assignmentId === assignment.id ? manual : null;

          return (
            <li key={assignment.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {assignment.selfPractice ? "나 (연습)" : assignment.studentName}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${STATUS_CLASS[assignment.status]}`}
                    >
                      {ASSIGNMENT_LABEL[assignment.status]}
                    </span>
                    {assignment.dueAt ? (
                      <span className="text-xs text-neutral-400">
                        ~{formatDate(assignment.dueAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-neutral-500">
                    {assignment.univName} {assignment.examTitle} · 문항 {questions.length}개
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {questions
                      .map((question) => `${question.number}번 ${questionLine(question)}`)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2 text-sm">
                  {/* 내가 낸 연습 과제는 여기서 바로 쓴다. */}
                  {assignment.selfPractice &&
                  assignment.status !== "submitted" &&
                  assignment.status !== "correcting" ? (
                    <Link
                      href={`/write/${assignment.id}`}
                      className="rounded-md border border-neutral-300 px-3 py-1.5"
                    >
                      {assignment.status === "assigned" ? "풀기" : "이어 쓰기"}
                    </Link>
                  ) : null}

                  {assignment.status === "submitted" || assignment.status === "correcting" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void correct(row)}
                        disabled={running !== null}
                        className="rounded-md bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40"
                        title="Claude API 로 돌립니다. 문항마다 요금이 듭니다."
                      >
                        {running === assignment.id
                          ? "첨삭 중…"
                          : `첨삭 돌리기 (${questions.length}문항)`}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setManual(
                            manualHere
                              ? null
                              : {
                                  assignmentId: assignment.id,
                                  questionId: questions[0].questionId,
                                },
                          )
                        }
                        className="rounded-md border border-neutral-300 px-3 py-1.5"
                        title="프롬프트를 복사해 내 Claude 구독으로 돌리고 결과만 붙여 넣습니다. 요금이 들지 않습니다."
                      >
                        직접 첨삭
                      </button>
                    </>
                  ) : null}

                  {corrected > 0 ? (
                    <Link
                      href={`/admin/corrections/${assignment.id}`}
                      className="rounded-md border border-neutral-300 px-3 py-1.5"
                    >
                      {assignment.status === "published" ? "결과 보기" : "확인하고 공개"}
                    </Link>
                  ) : null}

                  {assignment.status !== "assigned" ? (
                    <Link
                      href={`/print/answer/${assignment.id}`}
                      target="_blank"
                      className="rounded-md border border-neutral-300 px-3 py-1.5"
                    >
                      답안 인쇄
                    </Link>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void revoke(row)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-red-600"
                  >
                    {assignment.selfPractice ? "지우기" : "회수"}
                  </button>
                </div>
              </div>

              {manualHere ? (
                <div className="mt-3 rounded-lg border border-neutral-200 p-3">
                  {/* 프롬프트에는 답안 한 편이 들어간다 — 문항마다 한 번씩 돌린다. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-neutral-500">문항을 하나씩 돌립니다</span>
                    {questions.map((question) => (
                      <button
                        key={question.questionId}
                        type="button"
                        onClick={() =>
                          setManual({
                            assignmentId: assignment.id,
                            questionId: question.questionId,
                          })
                        }
                        className={[
                          "rounded-md border px-2.5 py-1 text-sm",
                          question.questionId === manualHere.questionId
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-300",
                        ].join(" ")}
                      >
                        {question.number}번
                        {question.correctionStatus === "done" ? " ✓" : ""}
                      </button>
                    ))}
                  </div>

                  <ManualRun
                    key={manualHere.questionId}
                    title={`직접 첨삭 — ${assignment.selfPractice ? "나 (연습)" : assignment.studentName} · ${
                      questions.find((q) => q.questionId === manualHere.questionId)?.number
                    }번`}
                    promptUrl={`/api/corrections/prompt?assignmentId=${assignment.id}&questionId=${manualHere.questionId}`}
                    submitUrl={`/api/corrections/manual?assignmentId=${assignment.id}&questionId=${manualHere.questionId}`}
                    onClose={() => setManual(null)}
                    onDone={(data) => {
                      const asked = Number(data.asked ?? 0);
                      const matched = Number(data.matched ?? 0);
                      if (asked > matched) {
                        // 자리를 못 찾은 코멘트는 빠진다. 조용히 넘어가면 왜 사라졌는지 알 수 없다.
                        setError(
                          `저장했습니다. 다만 코멘트 ${asked}개 중 ${asked - matched}개는 답안에서 그 대목을 찾지 못해 빠졌습니다.`,
                        );
                      }
                      applyCorrections(assignment.id, [data.correction as Correction]);

                      // 아직 안 넣은 문항이 있으면 그 문항으로 넘어간다.
                      const next = questions.find(
                        (question) =>
                          question.questionId !== manualHere.questionId &&
                          question.correctionStatus !== "done",
                      );
                      setManual(
                        next
                          ? { assignmentId: assignment.id, questionId: next.questionId }
                          : null,
                      );
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {running ? (
        <p className="mt-3 text-sm text-neutral-500">
          첨삭은 문항마다 1~3분 걸립니다. 이 화면을 켜 둔 채 기다려 주세요.
        </p>
      ) : null}
    </div>
  );
}
