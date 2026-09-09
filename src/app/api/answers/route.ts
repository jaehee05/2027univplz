import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiUser } from "@/lib/auth/dal";
import { answers, assignmentRef, toAnswer, toAssignment } from "@/lib/work/store";

const bodySchema = z.object({ assignmentId: z.string().min(1) });

/**
 * 과제의 답안을 연다. 없으면 만든다.
 * 학생이 쓰기 화면에 처음 들어올 때 한 번 불린다.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const snap = await assignmentRef(parsed.data.assignmentId).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }

  const assignment = toAssignment(snap);
  const mine = assignment.studentId === auth.user.uid || assignment.assignedBy === auth.user.uid;
  if (!mine) {
    return Response.json({ error: "내 과제가 아닙니다." }, { status: 403 });
  }

  if (assignment.answerId) {
    const existing = await answers().doc(assignment.answerId).get();
    if (existing.exists) return Response.json({ answer: toAnswer(existing) });
  }

  const ref = answers().doc();
  await ref.set({
    assignmentId: assignment.id,
    studentId: assignment.studentId,
    text: "",
    charCount: 0,
    charCountNoSpace: 0,
    status: "draft",
    updatedAt: FieldValue.serverTimestamp(),
    submittedAt: null,
  });
  await assignmentRef(assignment.id).update({ answerId: ref.id });

  return Response.json({ answer: toAnswer(await ref.get()) });
}
