import Link from "next/link";

import { requireTeacher } from "@/lib/auth/dal";
import { ManuscriptPlayground } from "@/components/manuscript/ManuscriptPlayground";

export default async function ManuscriptPage() {
  await requireTeacher();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="border-b border-neutral-200 pb-4">
        <Link href="/admin" className="text-sm text-neutral-500 underline">
          ← 관리 화면
        </Link>
        <h1 className="mt-2 text-2xl font-bold">원고지 확인</h1>
        <p className="mt-1 text-sm text-neutral-500">
          규격과 분량 조건을 바꿔 가며 배치·작성법 검사가 맞게 도는지 확인하는 화면입니다.
        </p>
      </header>

      <div className="mt-8">
        <ManuscriptPlayground />
      </div>
    </main>
  );
}
