import { after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { correctAnswer } from "@/lib/anthropic/correct";
import { loadCorrectionInput } from "@/lib/work/correction-input";
import {
  assignmentRef,
  correctionOf,
  correctionRef,
  corrections,
  listCorrectionsOf,
  refreshStatus,
  toAssignment,
} from "@/lib/work/store";

export const maxDuration = 800;

const bodySchema = z.object({
  assignmentId: z.string().min(1),
  /** 한 문항만 다시 돌릴 때. 없으면 시험지의 문항을 모두 돌린다. */
  questionId: z.string().min(1).optional(),
});

/**
 * 첨삭 실행. 확정된 채점 기준이 있어야 한다.
 *
 * 단위는 **시험지**지만, 모델은 문항마다 따로 부른다 — 채점 기준이 문항마다 100점이라
 * 한 번에 묶으면 배점이 섞인다. 문항별 첨삭 문서를 만들어 차례로 채운다.
 *
 * 첨삭은 몇 분씩 걸려서 응답을 붙잡고 있으면 게이트웨이가 먼저 연결을 끊는다.
 * 그래서 문서를 running 으로 만들어 바로 응답하고, 실제 작업은 응답 뒤에 이어서 한다.
 * 화면은 GET /api/assignments/[id]/corrections 로 상태를 물어 본다.
 */
export async function POST(request: Request) {
  const auth = await apiTeacher();
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
  if (assignment.assignedBy !== auth.user.uid) {
    return Response.json({ error: "내가 낸 과제가 아닙니다." }, { status: 403 });
  }

  const targets = questionId
    ? assignment.questions.filter((row) => row.questionId === questionId)
    : assignment.questions;
  if (targets.length === 0) {
    return Response.json({ error: "돌릴 문항이 없습니다." }, { status: 400 });
  }

  // 하나라도 조건이 안 맞으면(미제출 · 기준 미확정) 아무것도 시작하지 않는다.
  // 반쯤 돌다 멈추면 학생 결과지가 반쪽만 채워진다.
  const loaded = [];
  for (const question of targets) {
    const one = await loadCorrectionInput(assignmentId, question.questionId, auth.user.uid);
    if (!one.ok) return Response.json({ error: one.error }, { status: one.status });
    loaded.push(one);
  }

  // 다시 돌리는 경우 기존 문서를 재사용해 학생 화면의 링크가 바뀌지 않게 한다.
  const jobs = await Promise.all(
    loaded.map(async (one) => {
      const existing = await correctionOf(assignmentId, one.question.questionId);
      const ref = existing ? correctionRef(existing.id) : corrections().doc();

      await ref.set(
        {
          answerId: one.answer.id,
          assignmentId,
          questionId: one.question.questionId,
          studentId: assignment.studentId,
          // 선생님 목록 화면이 첨삭을 한 번에 읽을 수 있게 복사해 둔다.
          assignedBy: assignment.assignedBy,
          univId: assignment.univId,
          examId: assignment.examId,
          status: "running",
          published: false,
          teacherEdited: false,
          error: null,
          createdAt: FieldValue.serverTimestamp(),
          publishedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return { ref, input: one.input, number: one.question.number };
    }),
  );

  await assignmentRef(assignmentId).update({ status: "correcting" });

  // 응답을 보낸 뒤에 이어서 돌린다. 결과는 Firestore 에 쓴다.
  // 문항을 한꺼번에 부르면 속도 제한에 걸리기 쉬워 차례로 돌린다.
  after(async () => {
    for (const job of jobs) {
      try {
        const result = await correctAnswer(job.input);
        await job.ref.update({
          status: "done",
          scores: result.scores,
          inlineComments: result.inlineComments,
          overall: result.overall,
          revisedExample: result.revisedExample,
          usage: result.usage,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "첨삭에 실패했습니다.";
        await job.ref.update({
          status: "error",
          error: `${job.number}번 — ${message}`,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    await refreshStatus(assignmentId);
  });

  return Response.json({ corrections: await listCorrectionsOf(assignmentId) });
}
