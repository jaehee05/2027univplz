"use client";

import Link from "next/link";
import { useState } from "react";

import { ASSIGNMENT_LABEL, type Assignment, type Correction } from "@/lib/types/work";

const STATUS_CLASS: Record<Assignment["status"], string> = {
  assigned: "bg-neutral-100 text-neutral-600",
  writing: "bg-sky-100 text-sky-700",
  submitted: "bg-amber-100 text-amber-800",
  correcting: "bg-violet-100 text-violet-700",
  corrected: "bg-emerald-100 text-emerald-700",
  published: "bg-emerald-600 text-white",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export function AssignmentBoard({ initial }: { initial: Assignment[] }) {
  const [rows, setRows] = useState<Assignment[]>(initial);
  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = rows.filter((row) => {
    if (filter === "todo") return row.status === "submitted";
    if (filter === "done") return row.status === "corrected" || row.status === "published";
    return true;
  });
  const waiting = rows.filter((row) => row.status === "submitted").length;

  /** 첨삭은 몇 분 걸린다. 서버가 끝낼 때까지 상태를 물어 본다. */
  async function waitFor(correctionId: string): Promise<Correction> {
    const deadline = Date.now() + 12 * 60 * 1000;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const response = await fetch(`/api/corrections/${correctionId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "상태를 확인하지 못했습니다.");

      const correction: Correction = data.correction;
      if (correction.status === "done") return correction;
      if (correction.status === "error") {
        throw new Error(correction.error ?? "첨삭에 실패했습니다.");
      }
      if (Date.now() > deadline) {
        throw new Error("시간이 너무 오래 걸립니다. 잠시 뒤 새로고침해서 확인해 주세요.");
      }
    }
  }

  async function correct(assignment: Assignment) {
    setRunning(assignment.id);
    setError(null);
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: assignment.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "첨삭에 실패했습니다.");

      const correction = await waitFor(data.correction.id);
      setRows((prev) =>
        prev.map((row) =>
          row.id === assignment.id
            ? { ...row, status: "corrected", correctionId: correction.id }
            : row,
        ),
      );
    } catch (caught) {
      setError(
        `${assignment.studentName} · ${caught instanceof Error ? caught.message : "첨삭에 실패했습니다."}`,
      );
    } finally {
      setRunning(null);
    }
  }

  async function revoke(assignment: Assignment) {
    if (
      !confirm(
        `${assignment.studentName} 의 과제를 회수할까요? 학생이 쓴 답안과 첨삭 결과가 함께 지워집니다.`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/assignments/${assignment.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "회수에 실패했습니다.");
      return;
    }
    setRows(data.assignments ?? []);
  }

  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
        아직 내준 과제가 없습니다. 기출 화면에서 문항을 골라 학생에게 내주세요.
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
        {shown.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.studentName}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_CLASS[row.status]}`}>
                  {ASSIGNMENT_LABEL[row.status]}
                </span>
                {row.dueAt ? (
                  <span className="text-xs text-neutral-400">~{formatDate(row.dueAt)}</span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-sm text-neutral-500">
                {row.univName} {row.examTitle} {row.questionNumber}번
                {row.charTarget ? ` · ${row.charTarget}자` : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-sm">
              {row.status === "submitted" ? (
                <button
                  type="button"
                  onClick={() => void correct(row)}
                  disabled={running !== null}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40"
                >
                  {running === row.id ? "첨삭 중…" : "첨삭 돌리기"}
                </button>
              ) : null}

              {row.correctionId &&
              (row.status === "corrected" || row.status === "published") ? (
                <Link
                  href={`/admin/corrections/${row.correctionId}`}
                  className="rounded-md border border-neutral-300 px-3 py-1.5"
                >
                  {row.status === "published" ? "결과 보기" : "확인하고 공개"}
                </Link>
              ) : null}

              {row.answerId && row.status !== "assigned" ? (
                <Link
                  href={`/print/answer/${row.answerId}`}
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
                회수
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {running ? (
        <p className="mt-3 text-sm text-neutral-500">
          첨삭은 1~3분 걸립니다. 이 화면을 켜 둔 채 기다려 주세요.
        </p>
      ) : null}
    </div>
  );
}
