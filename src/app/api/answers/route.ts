import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiUser } from "@/lib/auth/dal";
import { answers, answerOf, assignmentRef, toAnswer, toAssignment } from "@/lib/work/store";

const bodySchema = z.object({
  assignmentId: z.string().min(1),
  questionId: z.string().min(1),
});

/**
 * 문항 하나의 답안을 연다. 없으면 만든다.
 *
 * 답안은 과제를 낼 때 문항마다 미리 만들어 두므로 보통은 있는 것을 그대로 돌려준다.
 * 기출에 문항이 나중에 늘었거나 하는 어긋남을 여기서 메운다.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { assignmentId, questionId } = parsed.data;

  const snap = await assignmentRef(assignmentId).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }

  const assignment = toAssignment(snap);
  const mine = assignment.studentId === auth.user.uid || assignment.assignedBy === auth.user.uid;
  if (!mine) {
    return Response.json({ error: "내 과제가 아닙니다." }, { status: 403 });
  }
  if (!assignment.questions.some((question) => question.questionId === questionId)) {
    return Response.json({ error: "이 과제에 없는 문항입니다." }, { status: 404 });
  }

  const existing = await answerOf(assignmentId, questionId);
  if (existing) return Response.json({ answer: existing });

  const ref = answers().doc();
  await ref.set({
    assignmentId,
    questionId,
    studentId: assignment.studentId,
    assignedBy: assignment.assignedBy,
    text: "",
    charCount: 0,
    charCountNoSpace: 0,
    status: "draft",
    updatedAt: FieldValue.serverTimestamp(),
    submittedAt: null,
  });

  return Response.json({ answer: toAnswer(await ref.get()) });
}
