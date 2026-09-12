import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/dal";
import { CorrectionReview } from "@/components/correction/CorrectionReview";
import type { SheetRow } from "@/components/correction/CorrectionSheets";
import {
  assignmentRef,
  lengthRuleOf,
  listAnswersOf,
  listCorrectionsOf,
  toAssignment,
  workRows,
} from "@/lib/work/store";

export default async function CorrectionPage({
  params,
}: PageProps<"/admin/corrections/[assignmentId]">) {
  await requireTeacher();
  const { assignmentId } = await params;

  const snap = await assignmentRef(assignmentId).get();
  if (!snap.exists) notFound();

  const assignment = toAssignment(snap);
  const [answerRows, correctionRows] = await Promise.all([
    listAnswersOf(assignmentId),
    listCorrectionsOf(assignmentId),
  ]);

  const rows: SheetRow[] = workRows(assignment, answerRows, correctionRows).map((row) => ({
    questionId: row.question.questionId,
    number: row.question.number,
    lengthRule: lengthRuleOf(row.question),
    answerText: row.answer?.text ?? "",
    correction: row.correction,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/admin/assignments"
        className="text-sm text-neutral-500 underline-offset-4 hover:underline"
      >
        ← 과제 · 첨삭
      </Link>

      <header className="mt-3 pb-4">
        <p className="text-sm text-neutral-500">
          {assignment.univName} · {assignment.examTitle} · 문항 {rows.length}개
        </p>
        <h1 className="mt-1 text-xl font-bold">
          {assignment.selfPractice ? "내 연습 답안" : `${assignment.studentName} 학생 답안`} 첨삭
        </h1>
      </header>

      <CorrectionReview
        assignmentId={assignment.id}
        studentName={assignment.selfPractice ? "나 (연습)" : assignment.studentName}
        initial={rows}
      />
    </main>
  );
}
