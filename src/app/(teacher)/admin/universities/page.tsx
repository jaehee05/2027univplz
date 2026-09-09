import Link from "next/link";

import { requireTeacher } from "@/lib/auth/dal";
import { UniversityManager } from "@/components/admin/UniversityManager";
import { listUniversities } from "@/lib/exam/store";

export default async function UniversitiesPage() {
  await requireTeacher();
  const universities = await listUniversities();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/admin" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
        ← 관리 화면
      </Link>
      <h1 className="mt-3 text-2xl font-bold">대학 관리</h1>
      <p className="mt-1 text-sm text-neutral-500">
        기출을 등록할 대학을 관리합니다. 대학을 눌러 기출과 채점 기준을 다룹니다.
      </p>
      <UniversityManager initial={universities} />
    </main>
  );
}
