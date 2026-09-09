import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { StudentManager } from "@/components/admin/StudentManager";
import { listStudents } from "@/lib/work/store";

export default async function StudentsPage() {
  const user = await requireTeacher();
  const students = await listStudents(user.uid);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav
        user={user}
        title="학생 관리"
        description="초대 코드로 가입한 학생 목록입니다. 중지하면 바로 로그아웃되고 다시 로그인할 수 없습니다."
      />
      <StudentManager initial={students} />
    </main>
  );
}
