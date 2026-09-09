import { FieldValue } from "firebase-admin/firestore";

import { apiUser } from "@/lib/auth/dal";
import { answerRef, assignmentRef, toAnswer } from "@/lib/work/store";

type Ctx = RouteContext<"/api/answers/[id]/submit">;

/** 제출 — 이 시점의 답안을 버전으로 남기고 잠근다. */
export async function POST(_request: Request, ctx: Ctx) {
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
    return Response.json({ error: "이미 제출했습니다." }, { status: 409 });
  }
  if (answer.text.trim().length === 0) {
    return Response.json({ error: "답안이 비어 있습니다." }, { status: 400 });
  }

  // 버전은 불변이라 제출 시점의 글을 그대로 남긴다.
  await answerRef(id).collection("versions").add({
    text: answer.text,
    charCount: answer.charCount,
    charCountNoSpace: answer.charCountNoSpace,
    savedAt: FieldValue.serverTimestamp(),
    reason: "submit",
  });

  await answerRef(id).update({
    status: "submitted",
    submittedAt: FieldValue.serverTimestamp(),
  });
  await assignmentRef(answer.assignmentId).update({ status: "submitted" });

  return Response.json({ ok: true, submittedAt: new Date().toISOString() });
}
