import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";

import { requireUser } from "@/lib/auth/dal";
import { AnswerWriter } from "@/components/manuscript/AnswerWriter";
import { PaperPane } from "@/components/manuscript/PaperPane";
import { examRef, questions, toExam, toQuestion } from "@/lib/exam/store";
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

  // 제시문과 원본 문제지는 기출 쪽에 있다.
  const [questionSnap, examSnap] = await Promise.all([
    questions(assignment.univId, assignment.examId).doc(assignment.questionId).get(),
    examRef(assignment.univId, assignment.examId).get(),
  ]);
  const question = questionSnap.exists ? toQuestion(questionSnap) : null;
  const exam = examSnap.exists ? toExam(examSnap, assignment.univId) : null;
  const paper = exam?.questionPdf ?? null;
  const hasPdf = Boolean(paper && paper.fileName.toLowerCase().endsWith(".pdf"));

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[1800px] flex-col px-5 py-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-neutral-200 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link
            href={assignment.selfPractice ? "/admin/assignments" : "/dashboard"}
            className="text-sm text-neutral-500 underline-offset-4 hover:underline"
          >
            ← {assignment.selfPractice ? "과제 · 첨삭" : "내 과제"}
          </Link>
          <h1 className="text-lg font-bold">
            {assignment.questionNumber}번
            {assignment.charTarget ? ` · ${assignment.charTarget}자 내외` : ""}
          </h1>
          <p className="text-sm text-neutral-500">
            {assignment.univName} · {assignment.examTitle}
          </p>
        </div>

        <Link
          href={`/print/exam/${assignment.id}`}
          target="_blank"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        >
          문제지 · 답안지 인쇄
        </Link>
      </header>

      {/* 왼쪽 문제지, 오른쪽 원고지. 원고지는 38칸이 들어갈 만큼만 차지한다. */}
      <div className="grid min-h-0 flex-1 gap-5 pt-4 xl:grid-cols-[minmax(360px,1fr)_auto]">
        <PaperPane
          assignmentId={assignment.id}
          prompt={assignment.questionPrompt}
          passages={question?.passages ?? []}
          hasPdf={hasPdf}
          pageFrom={paper?.pageFrom ?? null}
          pageTo={paper?.pageTo ?? null}
          version={[paper?.uploadedAt ?? "", paper?.pageFrom ?? 0, paper?.pageTo ?? 0].join("-")}
        />

        <div className="min-h-0 overflow-y-auto xl:pr-1">
          <AnswerWriter assignment={assignment} initial={answer} />
        </div>
      </div>
    </main>
  );
}
