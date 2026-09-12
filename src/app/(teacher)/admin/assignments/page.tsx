import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { AssignmentBoard, type BoardRow } from "@/components/admin/AssignmentBoard";
import { totalScore } from "@/lib/types/work";
import { groupWorkBy, listAssignmentsFor } from "@/lib/work/store";

export default async function AssignmentsPage() {
  const user = await requireTeacher();
  const [assignments, work] = await Promise.all([
    listAssignmentsFor("assignedBy", user.uid),
    groupWorkBy("assignedBy", user.uid),
  ]);

  // 문항별 상태를 미리 붙여 둔다 — 목록에서 문항마다 다시 물어보지 않게.
  const rows: BoardRow[] = assignments.map((assignment) => {
    const answerRows = work.answers.get(assignment.id) ?? [];
    const correctionRows = work.corrections.get(assignment.id) ?? [];

    return {
      assignment,
      questions: assignment.questions.map((question) => {
        const answer = answerRows.find((row) => row.questionId === question.questionId);
        const correction = correctionRows.find((row) => row.questionId === question.questionId);
        return {
          questionId: question.questionId,
          number: question.number,
          charCount: answer?.charCount ?? 0,
          submitted: answer?.status === "submitted",
          correctionStatus: correction?.status ?? null,
          score: correction?.status === "done" ? totalScore(correction.scores) : null,
        };
      }),
    };
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <AdminNav
        user={user}
        title="과제 · 첨삭"
        description="학생이 시험지를 제출하면 문항을 한꺼번에 첨삭하고, 점수와 코멘트를 확인한 뒤 학생에게 공개합니다."
      />
      <AssignmentBoard initial={rows} />
    </main>
  );
}
