import { FieldValue } from "firebase-admin/firestore";

import { apiUser } from "@/lib/auth/dal";
import { answerRef, assignmentRef, listAnswersOf, toAssignment, workRows } from "@/lib/work/store";

type Ctx = RouteContext<"/api/assignments/[id]/submit">;

/**
 * 제출 — 시험지 단위다. 문항 하나만 낼 수는 없다.
 * 이 시점의 답안을 문항마다 버전으로 남기고 모두 잠근다.
 */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const snap = await assignmentRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }

  const assignment = toAssignment(snap);
  if (assignment.studentId !== auth.user.uid) {
    return Response.json({ error: "내 과제가 아닙니다." }, { status: 403 });
  }

  const rows = workRows(assignment, await listAnswersOf(id), []);

  if (rows.every((row) => row.answer?.status === "submitted")) {
    return Response.json({ error: "이미 제출했습니다." }, { status: 409 });
  }

  const empty = rows.filter((row) => (row.answer?.text.trim().length ?? 0) === 0);
  if (empty.length > 0) {
    return Response.json(
      {
        error:
          `아직 쓰지 않은 문항이 있습니다 — ${empty.map((row) => `${row.question.number}번`).join(", ")}. ` +
          "시험지는 문항을 모두 쓴 뒤에 한꺼번에 냅니다.",
      },
      { status: 400 },
    );
  }

  // 버전은 불변이라 제출 시점의 글을 그대로 남긴다.
  await Promise.all(
    rows.map(async ({ answer }) => {
      if (!answer || answer.status === "submitted") return;
      await answerRef(answer.id).collection("versions").add({
        text: answer.text,
        charCount: answer.charCount,
        charCountNoSpace: answer.charCountNoSpace,
        savedAt: FieldValue.serverTimestamp(),
        reason: "submit",
      });
      await answerRef(answer.id).update({
        status: "submitted",
        submittedAt: FieldValue.serverTimestamp(),
      });
    }),
  );

  await assignmentRef(id).update({
    status: "submitted",
    submittedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true, submittedAt: new Date().toISOString() });
}
