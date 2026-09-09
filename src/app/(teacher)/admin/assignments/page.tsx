import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { AssignmentBoard } from "@/components/admin/AssignmentBoard";
import { listAssignmentsFor } from "@/lib/work/store";

export default async function AssignmentsPage() {
  const user = await requireTeacher();
  const assignments = await listAssignmentsFor("assignedBy", user.uid);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <AdminNav
        user={user}
        title="과제 · 첨삭"
        description="학생이 제출하면 첨삭을 돌리고, 점수와 코멘트를 확인한 뒤 학생에게 공개합니다."
      />
      <AssignmentBoard initial={assignments} />
    </main>
  );
}
