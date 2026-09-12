import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";

import { requireUser } from "@/lib/auth/dal";
import { WriteWorkspace } from "@/components/manuscript/WriteWorkspace";
import { examRef, listQuestions, toExam } from "@/lib/exam/store";
import { mergePassages } from "@/lib/exam/passages";
import { answers, assignmentRef, listAnswersOf, toAssignment } from "@/lib/work/store";

export default async function WritePage({ params }: PageProps<"/write/[assignmentId]">) {
  const user = await requireUser();
  const { assignmentId } = await params;

  const snap = await assignmentRef(assignmentId).get();
  if (!snap.exists) notFound();

  const assignment = toAssignment(snap);
  if (assignment.studentId !== user.uid && user.role !== "teacher") redirect("/dashboard");

  // 답안은 과제를 낼 때 문항마다 만들어 둔다. 빠진 것이 있으면 여기서 메운다.
  let answerRows = await listAnswersOf(assignment.id);
  const missing = assignment.questions.filter(
    (question) => !answerRows.some((row) => row.questionId === question.questionId),
  );
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (question) => {
        const ref = answers().doc();
        await ref.set({
          assignmentId: assignment.id,
          questionId: question.questionId,
          studentId: assignment.studentId,
          assignedBy: assignment.assignedBy,
          text: "",
          charCount: 0,
          charCountNoSpace: 0,
          status: "draft",
          updatedAt: FieldValue.serverTimestamp(),
          submittedAt: null,
        });
      }),
    );
    answerRows = await listAnswersOf(assignment.id);
  }

  // 제시문과 원본 문제지는 기출 쪽에 있다.
  const [sourceQuestions, examSnap] = await Promise.all([
    listQuestions(assignment.univId, assignment.examId),
    examRef(assignment.univId, assignment.examId).get(),
  ]);
  const exam = examSnap.exists ? toExam(examSnap, assignment.univId) : null;
  const paper = exam?.questionPdf ?? null;
  const hasPdf = Boolean(paper && paper.fileName.toLowerCase().endsWith(".pdf"));

  // 여러 문항이 함께 쓰는 제시문은 한 번만 싣는다.
  const passages = mergePassages(
    assignment.questions.map(
      (question) => sourceQuestions.find((row) => row.id === question.questionId)?.passages,
    ),
  );

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
          <h1 className="text-lg font-bold">{assignment.examTitle}</h1>
          <p className="text-sm text-neutral-500">
            {assignment.univName} · 문항 {assignment.questions.length}개
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

      <WriteWorkspace
        assignment={assignment}
        answers={answerRows}
        passages={passages}
        paper={{
          hasPdf,
          pageFrom: paper?.pageFrom ?? null,
          pageTo: paper?.pageTo ?? null,
          version: [paper?.uploadedAt ?? "", paper?.pageFrom ?? 0, paper?.pageTo ?? 0].join("-"),
        }}
      />
    </main>
  );
}
