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
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/dashboard"
          className="text-sm text-neutral-500 underline-offset-4 hover:underline"
        >
          ← 내 과제
        </Link>
        <Link
          href={`/print/correction/${assignment.id}`}
          target="_blank"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        >
          첨삭 결과지 인쇄
        </Link>
      </div>

      <header className="mt-3 border-b border-neutral-200 pb-4">
        <p className="text-sm text-neutral-500">{assignment.univName}</p>
        <h1 className="mt-1 text-xl font-bold">{assignment.examTitle} 첨삭 결과</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {sheets
            .map(
              (sheet) =>
                `${sheet.number}번 ${sheet.correction ? totalScore(sheet.correction.scores) : 0}점`,
            )
            .join(" · ")}
        </p>
      </header>

      <div className="mt-6">
        <CorrectionSheets rows={sheets} />
      </div>
    </main>
  );
}
