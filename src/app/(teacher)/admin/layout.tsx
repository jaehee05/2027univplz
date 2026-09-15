import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/shell/AdminSidebar";
import { requireTeacher } from "@/lib/auth/dal";
import { listAssignmentsFor, listStudents } from "@/lib/work/store";

/**
 * 관리 화면의 겉틀. 넓으면 왼쪽 기둥, 좁으면 위 막대와 서랍.
 * 손봐야 할 시험지 수를 기둥에 달아, 어느 화면에 있든 밀린 일이 보이게 한다.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireTeacher();
  const [assignments, students] = await Promise.all([
    listAssignmentsFor("assignedBy", user.uid),
    listStudents(user.uid),
  ]);

  // 첨삭을 돌려야 하는 것과 공개를 눌러야 하는 것 — 둘 다 선생님 차례다.
  const pending = assignments.filter(
    (row) => row.status === "submitted" || row.status === "corrected",
  ).length;
  const waitingStudents = students.filter((row) => row.approval === "pending").length;

  return (
    <div className="lg:flex">
      <AdminSidebar user={user} counts={{ pending, waitingStudents }} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
