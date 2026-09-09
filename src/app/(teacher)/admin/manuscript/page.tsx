import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { ManuscriptPlayground } from "@/components/manuscript/ManuscriptPlayground";

export default async function ManuscriptPage() {
  const user = await requireTeacher();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <AdminNav
        user={user}
        title="원고지 확인"
        description="규격과 분량 조건을 바꿔 가며 배치·작성법 검사가 맞게 도는지 확인하는 화면입니다."
        back={{ href: "/admin", label: "관리 화면" }}
      />
      <div className="mt-8">
        <ManuscriptPlayground />
      </div>
    </main>
  );
}
