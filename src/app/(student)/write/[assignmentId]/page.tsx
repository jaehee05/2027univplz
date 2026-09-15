import type { Metadata } from "next";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";

import { requireUser } from "@/lib/auth/dal";
import { WriteWorkspace } from "@/components/manuscript/WriteWorkspace";
import { examRef, listQuestions, toExam } from "@/lib/exam/store";
import { mergePassages } from "@/lib/exam/passages";
import { answers, assignmentRef, listAnswersOf, toAssignment } from "@/lib/work/store";

export const metadata: Metadata = { title: "답안 쓰기" };

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
  // 선생님이 학생용 문제지를 따로 올렸으면 그것이 나간다.
  const paper = exam?.studentPdf ?? exam?.questionPdf ?? null;
  const hasPdf = Boolean(paper && paper.fileName.toLowerCase().endsWith(".pdf"));

  // 여러 문항이 함께 쓰는 제시문은 한 번만 싣는다.
  const passages = mergePassages(
    assignment.questions.map(
      (question) => sourceQuestions.find((row) => row.id === question.questionId)?.passages,
    ),
  );

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[1800px] flex-col px-4 py-3 sm:px-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-neutral-200 pb-3">
        <div className="flex min-w-0 items-baseline gap-x-3">
          <Link
            href={assignment.selfPractice ? "/admin/assignments" : "/dashboard"}
            className="shrink-0 text-sm text-neutral-500 underline-offset-4 hover:underline"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-bold">{assignment.examTitle}</h1>
            <p className="text-xs text-neutral-500">
              {assignment.univName} · 문항 {assignment.questions.length}개
            </p>
          </div>
        </div>

        <Link
          href={`/print/exam/${assignment.id}`}
          target="_blank"
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium"
        >
          인쇄
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
          // 파일이나 쪽 범위가 바뀌면 주소가 달라져 학생 브라우저가 새로 받는다.
          version: [paper?.uploadedAt ?? "", paper?.pageFrom ?? 0, paper?.pageTo ?? 0].join("-"),
        }}
      />
    </main>
  );
}
