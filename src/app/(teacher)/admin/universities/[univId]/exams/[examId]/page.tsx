import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/dal";
import { ExamWorkbench } from "@/components/admin/ExamWorkbench";
import {
  analysisRef,
  examRef,
  listQuestions,
  toAnalysis,
  toExam,
  toUniversity,
  universityRef,
} from "@/lib/exam/store";

export default async function ExamPage({
  params,
}: PageProps<"/admin/universities/[univId]/exams/[examId]">) {
  await requireTeacher();

  const { univId, examId } = await params;
  const [univSnap, examSnap, analysisSnap, questions] = await Promise.all([
    universityRef(univId).get(),
    examRef(univId, examId).get(),
    analysisRef(univId, examId).get(),
    listQuestions(univId, examId),
  ]);
  if (!univSnap.exists || !examSnap.exists) notFound();

  const university = toUniversity(univSnap);
  const exam = toExam(examSnap, univId);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <Link
        href={`/admin/universities/${univId}`}
        className="text-sm text-neutral-500 underline-offset-4 hover:underline"
      >
        ← {university.name}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">
        {exam.year}학년도 {exam.title}
        {exam.session ? ` · ${exam.session}` : ""}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        PDF 올리기 → 텍스트 추출 → 문항 뽑기 → 채점 기준 분석 → 확정 순서로 진행합니다.
      </p>

      <ExamWorkbench
        exam={exam}
        questions={questions}
        analysis={analysisSnap.exists ? toAnalysis(analysisSnap, univId) : null}
      />
    </main>
  );
}
