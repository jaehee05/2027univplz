import Link from "next/link";

import { ASSIGNMENT_LABEL, type Assignment, type Correction } from "@/lib/types/work";
import { totalScore } from "@/lib/types/work";
import {
  assignmentProgress,
  dueLabel,
  type QuestionProgress,
} from "@/lib/work/summary";

/** 학생이 지금 무엇을 해야 하는지 한 줄로 */
function nextAction(assignment: Assignment) {
  switch (assignment.status) {
    case "assigned":
      return { href: `/write/${assignment.id}`, label: "답안 쓰기", primary: true };
    case "writing":
      return { href: `/write/${assignment.id}`, label: "이어 쓰기", primary: true };
    case "published":
      return { href: `/results/${assignment.id}`, label: "첨삭 보기", primary: true };
    default:
      return { href: `/write/${assignment.id}`, label: "내 답안 보기", primary: false };
  }
}

const STATUS_TONE: Record<string, string> = {
  assigned: "bg-neutral-100 text-neutral-600",
  writing: "bg-brand-50 text-brand-700",
  submitted: "bg-amber-50 text-amber-700",
  correcting: "bg-amber-50 text-amber-700",
  corrected: "bg-amber-50 text-amber-700",
  published: "bg-emerald-50 text-emerald-700",
};

export function AssignmentCard({
  assignment,
  progress,
  corrections,
}: {
  assignment: Assignment;
  progress: QuestionProgress[];
  /** 공개된 첨삭이 있으면 점수를 함께 보여 준다 */
  corrections: Correction[];
}) {
  const action = nextAction(assignment);
  const due = dueLabel(assignment.dueAt);
  const ratio = assignmentProgress(progress);
  const done = assignment.status === "published";

  const scores = corrections
    .filter((row) => row.status === "done" && row.published)
    .sort((a, b) => a.questionId.localeCompare(b.questionId));

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-neutral-500">{assignment.univName}</p>
          <h3 className="mt-0.5 truncate font-semibold">{assignment.examTitle}</h3>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              STATUS_TONE[assignment.status] ?? "bg-neutral-100 text-neutral-600"
            }`}
          >
            {ASSIGNMENT_LABEL[assignment.status]}
          </span>
          {due && !done ? (
            <span
              className={`text-xs font-medium ${due.urgent ? "text-rose-600" : "text-neutral-500"}`}
            >
              {due.text}
            </span>
          ) : null}
        </div>
      </div>

      {/* 첨삭이 끝났으면 점수를, 아직이면 얼마나 썼는지를 보여 준다. */}
      {done && scores.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {scores.map((correction, index) => {
            const total = totalScore(correction.scores);
            return (
              <li
                key={correction.id}
                className="flex items-baseline gap-1.5 rounded-lg bg-neutral-50 px-3 py-1.5 text-sm"
              >
                <span className="text-neutral-500">
                  {progress[index]?.number ?? index + 1}번
                </span>
                <span
                  className={`font-bold tabular-nums ${
                    total >= 70
                      ? "text-emerald-600"
                      : total >= 45
                        ? "text-brand-600"
                        : "text-rose-600"
                  }`}
                >
                  {total}
                </span>
                <span className="text-xs text-neutral-400">점</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs text-neutral-500">
            <span>
              문항 {progress.length}개
              {progress.some((row) => row.charTarget)
                ? ` · ${progress.map((row) => row.number).join("·")}번`
                : ""}
            </span>
            <span className="font-medium tabular-nums">{Math.round(ratio * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
              style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%` }}
            />
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
            {progress.map((row) => (
              <li key={row.questionId} className="flex items-baseline gap-2">
                <span className="w-8 shrink-0 font-medium text-neutral-600">{row.number}번</span>
                <span className="tabular-nums">
                  {row.charCount}
                  {row.charTarget ? ` / ${row.charTarget}자` : "자"}
                </span>
                {row.submitted ? <span className="text-emerald-600">제출</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={action.href}
        className={[
          "mt-4 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition",
          action.primary
            ? "bg-neutral-900 text-white hover:bg-neutral-700"
            : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50",
        ].join(" ")}
      >
        {action.label}
      </Link>
    </article>
  );
}
