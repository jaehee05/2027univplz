import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/AdminNav";
import { AnswerSheetFiller } from "@/components/answer-sheet/AnswerSheetFiller";
import { requireTeacher } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "답안지 채우기" };

export default async function AnswerSheetPage() {
  const user = await requireTeacher();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <AdminNav
        user={user}
        title="답안지 채우기"
        description="성신여대 논술 답안지 원고지 칸에 손글씨 글꼴로 답안을 넣고, 답안지 PDF 그대로 내려받습니다."
        back={{ href: "/admin", label: "관리 화면" }}
      />
      <div className="mt-8">
        <AnswerSheetFiller />
      </div>
    </main>
  );
}
