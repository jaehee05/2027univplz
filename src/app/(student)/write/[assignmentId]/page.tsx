import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";

import { requireUser } from "@/lib/auth/dal";
import { AnswerWriter } from "@/components/manuscript/AnswerWriter";
import { questions, toQuestion } from "@/lib/exam/store";
import { answers, assignmentRef, toAnswer, toAssignment } from "@/lib/work/store";

export default async function WritePage({ params }: PageProps<"/write/[assignmentId]">) {
  const user = await requireUser();
  const { assignmentId } = await params;

  const snap = await assignmentRef(assignmentId).get();
  if (!snap.exists) notFound();

  const assignment = toAssignment(snap);
  if (assignment.studentId !== user.uid && user.role !== "teacher") redirect("/dashboard");

  // 답안 문서는 처음 들어올 때 만든다.
  let answer = null;
  if (assignment.answerId) {
    const answerSnap = await answers().doc(assignment.answerId).get();
    if (answerSnap.exists) answer = toAnswer(answerSnap);
  }
  if (!answer) {
    const ref = answers().doc();
    await ref.set({
      assignmentId: assignment.id,
      studentId: assignment.studentId,
      text: "",
      charCount: 0,
      charCountNoSpace: 0,
      status: "draft",
      updatedAt: FieldValue.serverTimestamp(),
      submittedAt: null,
    });
    await assignmentRef(assignment.id).update({ answerId: ref.id });
    answer = toAnswer(await ref.get());
  }

  // 제시문은 과제에 복사해 두지 않으므로 기출에서 읽는다.
  const questionSnap = await questions(assignment.univId, assignment.examId)
    .doc(assignment.questionId)
    .get();
  const question = questionSnap.exists ? toQuestion(questionSnap) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/dashboard"
        className="text-sm text-neutral-500 underline-offset-4 hover:underline"
      >
        ← 내 과제
      </Link>

      <header className="mt-3 border-b border-neutral-200 pb-4">
        <p className="text-sm text-neutral-500">
          {assignment.univName} · {assignment.examTitle}
        </p>
        <h1 className="mt-1 text-xl font-bold">
          {assignment.questionNumber}번
          {assignment.charTarget ? ` · ${assignment.charTarget}자 내외` : ""}
        </h1>
      </header>

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className="space-y-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto">
          <section>
            <h2 className="text-sm font-semibold text-neutral-500">논제</h2>
            <p className="mt-1 leading-7 whitespace-pre-wrap">{assignment.questionPrompt}</p>
          </section>

          {question?.passages.map((passage) => (
            <section key={passage.label}>
              <h2 className="text-sm font-semibold text-neutral-500">제시문 {passage.label}</h2>
              <p className="mt-1 leading-7 whitespace-pre-wrap">{passage.text}</p>
            </section>
          ))}

          <Link
            href={`/print/exam/${assignment.id}`}
            target="_blank"
            className="inline-block rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            문제지 인쇄
          </Link>
        </aside>

        <div className="min-w-0">
          <AnswerWriter assignment={assignment} initial={answer} />
        </div>
      </div>
    </main>
  );
}
