import { apiTeacher } from "@/lib/auth/dal";
import {
  answerRef,
  assignmentRef,
  correctionRef,
  listAssignmentsFor,
  toAssignment,
} from "@/lib/work/store";

type Ctx = RouteContext<"/api/assignments/[id]">;

/** 과제 회수 — 답안 · 첨삭까지 함께 지운다. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const snap = await assignmentRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }

  const assignment = toAssignment(snap);
  if (assignment.assignedBy !== auth.user.uid) {
    return Response.json({ error: "내가 낸 과제가 아닙니다." }, { status: 403 });
  }

  const batch = assignmentRef(id).firestore.batch();
  if (assignment.answerId) batch.delete(answerRef(assignment.answerId));
  if (assignment.correctionId) batch.delete(correctionRef(assignment.correctionId));
  batch.delete(assignmentRef(id));
  await batch.commit();

  return Response.json({ assignments: await listAssignmentsFor("assignedBy", auth.user.uid) });
}
