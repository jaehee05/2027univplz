import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { ExamWorkbench } from "@/components/admin/ExamWorkbench";
import { listStudents } from "@/lib/work/store";
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
  const user = await requireTeacher();

  const { univId, examId } = await params;
  const [univSnap, examSnap, analysisSnap, questions, students] = await Promise.all([
    universityRef(univId).get(),
    examRef(univId, examId).get(),
    analysisRef(univId, examId).get(),
    listQuestions(univId, examId),
    listStudents(user.uid),
  ]);
  if (!univSnap.exists || !examSnap.exists) notFound();

  const university = toUniversity(univSnap);
  const exam = toExam(examSnap, univId);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <AdminNav
        user={user}
        title={`${exam.year}학년도 ${exam.title}${exam.session ? ` · ${exam.session}` : ""}`}
        description="PDF 올리기 → 텍스트 추출 → 문항 뽑기 → 채점 기준 분석 → 확정 → 학생에게 내주기"
        back={{ href: `/admin/universities/${univId}`, label: university.name }}
      />

      <ExamWorkbench
        exam={exam}
        questions={questions}
        analysis={analysisSnap.exists ? toAnalysis(analysisSnap, univId) : null}
        students={students}
        teacherUid={user.uid}
      />
    </main>
  );
}
