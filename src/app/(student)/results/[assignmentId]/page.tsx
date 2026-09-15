import type { Metadata } from "next";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/dal";
import { CorrectionSheets, type SheetRow } from "@/components/correction/CorrectionSheets";
import { totalScore } from "@/lib/types/work";
import {
  assignmentRef,
  lengthRuleOf,
  listAnswersOf,
  listCorrectionsOf,
  toAssignment,
  workRows,
} from "@/lib/work/store";

export const metadata: Metadata = { title: "첨삭 결과" };

export default async function ResultPage({ params }: PageProps<"/results/[assignmentId]">) {
  const user = await requireUser();
  const { assignmentId } = await params;

  const snap = await assignmentRef(assignmentId).get();
  if (!snap.exists) notFound();

  const assignment = toAssignment(snap);
  const isTeacher = user.role === "teacher";
  if (!isTeacher && assignment.studentId !== user.uid) redirect("/dashboard");

  const [answerRows, correctionRows] = await Promise.all([
    listAnswersOf(assignmentId),
    listCorrectionsOf(assignmentId),
  ]);

  // 학생은 공개된 것만 본다. 공개는 시험지 단위라 보통 전부이거나 전부 아니다.
  const rows = workRows(assignment, answerRows, correctionRows)
    .map((row) => ({
      ...row,
      correction: isTeacher || row.correction?.published ? row.correction : null,
    }))
    .filter((row) => row.correction);

  if (rows.length === 0) redirect("/dashboard");

  const sheets: SheetRow[] = rows.map((row) => ({
    questionId: row.question.questionId,
    number: row.question.number,
    lengthRule: lengthRuleOf(row.question),
    answerText: row.answer?.text ?? "",
    correction: row.correction,
  }));

  return (
    <main className="pb-tabbar mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/history"
          className="text-sm text-neutral-500 underline-offset-4 hover:underline"
        >
          ← 첨삭 결과
        </Link>
        <Link
          href={`/print/correction/${assignment.id}`}
          target="_blank"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium"
        >
          인쇄
        </Link>
      </div>

      <header className="mt-3">
        <p className="text-sm text-neutral-500">{assignment.univName}</p>
        <h1 className="mt-0.5 text-xl font-bold sm:text-2xl">{assignment.examTitle}</h1>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600">
          {sheets.map((sheet) => (
            <span key={sheet.questionId}>
              <span className="text-neutral-400">{sheet.number}번</span>{" "}
              <b className="tabular-nums">
                {sheet.correction ? totalScore(sheet.correction.scores) : 0}
              </b>
              점
            </span>
          ))}
        </p>
      </header>

      <div className="mt-5">
        <CorrectionSheets rows={sheets} />
      </div>
    </main>
  );
}
