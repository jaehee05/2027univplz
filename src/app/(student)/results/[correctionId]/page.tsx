import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/dal";
import { CorrectionView } from "@/components/correction/CorrectionView";
import { answerRef, assignmentRef, correctionRef, toAnswer, toAssignment, toCorrection } from "@/lib/work/store";

export default async function ResultPage({ params }: PageProps<"/results/[correctionId]">) {
  const user = await requireUser();
  const { correctionId } = await params;

  const snap = await correctionRef(correctionId).get();
  if (!snap.exists) notFound();

  const correction = toCorrection(snap);
  const isTeacher = user.role === "teacher";
  if (!isTeacher && (correction.studentId !== user.uid || !correction.published)) {
    redirect("/dashboard");
  }

  const [answerSnap, assignmentSnap] = await Promise.all([
    answerRef(correction.answerId).get(),
    assignmentRef(correction.assignmentId).get(),
  ]);
  const answer = answerSnap.exists ? toAnswer(answerSnap) : null;
  const assignment = assignmentSnap.exists ? toAssignment(assignmentSnap) : null;

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
          href={`/print/correction/${correction.id}`}
          target="_blank"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        >
          첨삭 결과지 인쇄
        </Link>
      </div>

      <header className="mt-3 border-b border-neutral-200 pb-4">
        <p className="text-sm text-neutral-500">
          {assignment?.univName} · {assignment?.examTitle}
        </p>
        <h1 className="mt-1 text-xl font-bold">
          {assignment?.questionNumber}번 첨삭 결과
        </h1>
      </header>

      <div className="mt-6">
        <CorrectionView
          correction={correction}
          answerText={answer?.text ?? ""}
          lengthRule={
            assignment?.charTarget
              ? { target: assignment.charTarget, tolerance: assignment.tolerance }
              : null
          }
          label={assignment ? `문제 ${assignment.questionNumber}` : undefined}
        />
      </div>
    </main>
  );
}
