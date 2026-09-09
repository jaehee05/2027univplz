import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/dal";
import { ExamList } from "@/components/admin/ExamList";
import { listExams, toUniversity, universityRef } from "@/lib/exam/store";

export default async function UniversityPage({
  params,
}: PageProps<"/admin/universities/[univId]">) {
  await requireTeacher();

  const { univId } = await params;
  const snap = await universityRef(univId).get();
  if (!snap.exists) notFound();

  const university = toUniversity(snap);
  const exams = await listExams(univId);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/admin/universities"
        className="text-sm text-neutral-500 underline-offset-4 hover:underline"
      >
        ← 대학 관리
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{university.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        연도별 기출을 등록하고, 문제·해설 PDF 를 올려 채점 기준을 만듭니다.
      </p>
      <ExamList univId={univId} initial={exams} />
    </main>
  );
}
