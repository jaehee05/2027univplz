import Link from "next/link";

import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { ExamIntake } from "@/components/admin/ExamIntake";
import { listUniversities } from "@/lib/exam/store";

export default async function IntakePage() {
  const user = await requireTeacher();
  const universities = await listUniversities();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <AdminNav
        user={user}
        title="기출 한꺼번에 올리기"
        description="대학을 고르지 않고 그냥 올리면, 파일마다 어느 대학·연도·계열·종류인지 읽어서 나눕니다."
        back={{ href: "/admin/universities", label: "대학 관리" }}
      />

      {universities.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          먼저{" "}
          <Link href="/admin/universities" className="underline underline-offset-4">
            대학을 등록
          </Link>
          해 주세요. 등록된 대학 중에서 골라 붙입니다.
        </p>
      ) : (
        <div className="mt-6">
          <ExamIntake universities={universities} />
        </div>
      )}
    </main>
  );
}
