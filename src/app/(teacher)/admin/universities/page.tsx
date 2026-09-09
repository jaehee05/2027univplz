import Link from "next/link";

import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { UniversityManager } from "@/components/admin/UniversityManager";
import { listUniversities } from "@/lib/exam/store";

export default async function UniversitiesPage() {
  const user = await requireTeacher();
  const universities = await listUniversities();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav
        user={user}
        title="대학 관리"
        description="기출을 등록할 대학을 관리합니다. 대학을 눌러 기출과 채점 기준을 다룹니다."
      />
      {universities.length > 0 ? (
        <Link
          href="/admin/intake"
          className="mt-4 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          기출 한꺼번에 올리기 (대학 안 고르고)
        </Link>
      ) : null}

      <UniversityManager initial={universities} />
    </main>
  );
}
