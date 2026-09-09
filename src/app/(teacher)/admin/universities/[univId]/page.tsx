import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { ExamList } from "@/components/admin/ExamList";
import { listExams, listUniversities, toUniversity, universityRef } from "@/lib/exam/store";

export default async function UniversityPage({
  params,
}: PageProps<"/admin/universities/[univId]">) {
  const user = await requireTeacher();

  const { univId } = await params;
  const snap = await universityRef(univId).get();
  if (!snap.exists) notFound();

  const university = toUniversity(snap);
  const [exams, universities] = await Promise.all([listExams(univId), listUniversities()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav
        user={user}
        title={university.name}
        description="연도별 기출을 등록하고, 문제·해설 PDF 를 올려 채점 기준을 만듭니다."
        back={{ href: "/admin/universities", label: "대학 관리" }}
      />

      <ExamList univId={univId} initial={exams} universities={universities} />
    </main>
  );
}
