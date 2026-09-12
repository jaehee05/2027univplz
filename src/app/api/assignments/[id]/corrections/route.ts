import { apiUser } from "@/lib/auth/dal";
import { assignmentRef, listCorrectionsOf, toAssignment } from "@/lib/work/store";

type Ctx = RouteContext<"/api/assignments/[id]/corrections">;

/**
 * 이 시험지의 첨삭을 문항째로 돌려준다. 진행 상황을 물어 볼 때 쓴다.
 * 학생은 공개된 뒤에만 볼 수 있다.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const snap = await assignmentRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }

  const assignment = toAssignment(snap);
  const isTeacher = auth.user.role === "teacher";
  if (!isTeacher && assignment.studentId !== auth.user.uid) {
    return Response.json({ error: "내 과제가 아닙니다." }, { status: 403 });
  }

  const rows = await listCorrectionsOf(id);
  return Response.json({
    corrections: isTeacher ? rows : rows.filter((row) => row.published),
  });
}
