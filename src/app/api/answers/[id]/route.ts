import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiUser } from "@/lib/auth/dal";
import { answerRef, assignmentRef, toAnswer, toAssignment } from "@/lib/work/store";

type Ctx = RouteContext<"/api/answers/[id]">;

const bodySchema = z.object({
  text: z.string().max(20000),
  charCount: z.number().int().min(0),
  charCountNoSpace: z.number().int().min(0),
});

/** 자동 저장. 제출한 뒤에는 학생이 고칠 수 없다. */
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const snap = await answerRef(id).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 답안입니다." }, { status: 404 });
  }

  const answer = toAnswer(snap);
  if (answer.studentId !== auth.user.uid) {
    return Response.json({ error: "내 답안이 아닙니다." }, { status: 403 });
  }
  if (answer.status === "submitted") {
    return Response.json({ error: "이미 제출한 답안은 고칠 수 없습니다." }, { status: 409 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  await answerRef(id).update({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() });

  // 처음 글자를 넣은 순간 과제 상태를 '쓰는 중' 으로 옮긴다.
  const assignmentSnap = await assignmentRef(answer.assignmentId).get();
  if (assignmentSnap.exists && toAssignment(assignmentSnap).status === "assigned") {
    await assignmentRef(answer.assignmentId).update({ status: "writing" });
  }

  return Response.json({ savedAt: new Date().toISOString() });
}
