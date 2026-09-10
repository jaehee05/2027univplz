import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/dal";
import { CorrectionReview } from "@/components/correction/CorrectionReview";
import {
  answerRef,
  assignmentRef,
  correctionRef,
  toAnswer,
  toAssignment,
  toCorrection,
} from "@/lib/work/store";

export default async function CorrectionPage({ params }: PageProps<"/admin/corrections/[id]">) {
  await requireTeacher();
  const { id } = await params;

  const snap = await correctionRef(id).get();
  if (!snap.exists) notFound();

  const correction = toCorrection(snap);
  const [answerSnap, assignmentSnap] = await Promise.all([
    answerRef(correction.answerId).get(),
    assignmentRef(correction.assignmentId).get(),
  ]);
  const answer = answerSnap.exists ? toAnswer(answerSnap) : null;
  const assignment = assignmentSnap.exists ? toAssignment(assignmentSnap) : null;

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
          {assignment?.univName} · {assignment?.examTitle} {assignment?.questionNumber}번
        </p>
        <h1 className="mt-1 text-xl font-bold">{assignment?.studentName} 학생 답안 첨삭</h1>
      </header>

      <CorrectionReview
        initial={correction}
        answerText={answer?.text ?? ""}
        studentName={assignment?.studentName ?? ""}
        lengthRule={
          assignment?.charTarget
            ? {
                target: assignment.charTarget,
                tolerance: assignment.tolerance,
                min: assignment.charMin,
                max: assignment.charMax,
              }
            : null
        }
        label={assignment ? `문제 ${assignment.questionNumber}` : undefined}
      />
    </main>
  );
}
