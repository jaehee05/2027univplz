import { after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { correctAnswer } from "@/lib/anthropic/correct";
import {
  analysisRef,
  questions,
  toAnalysis,
  toQuestion,
  toUniversity,
  universityRef,
} from "@/lib/exam/store";
import {
  answerRef,
  assignmentRef,
  correctionRef,
  corrections,
  toAnswer,
  toAssignment,
  toCorrection,
} from "@/lib/work/store";

export const maxDuration = 800;

const bodySchema = z.object({ assignmentId: z.string().min(1) });

/**
 * 첨삭 실행. 확정된 채점 기준이 있어야 한다.
 *
 * 첨삭은 몇 분씩 걸려서 응답을 붙잡고 있으면 게이트웨이가 먼저 연결을 끊는다.
 * 그래서 문서를 running 으로 만들어 바로 응답하고, 실제 작업은 응답 뒤에 이어서 한다.
 * 화면은 GET /api/corrections/[id] 로 상태를 물어 본다.
 */
export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const assignmentSnap = await assignmentRef(parsed.data.assignmentId).get();
  if (!assignmentSnap.exists) {
    return Response.json({ error: "없는 과제입니다." }, { status: 404 });
  }
  const assignment = toAssignment(assignmentSnap);
  if (assignment.assignedBy !== auth.user.uid) {
    return Response.json({ error: "내가 낸 과제가 아닙니다." }, { status: 403 });
  }
  if (!assignment.answerId) {
    return Response.json({ error: "아직 답안이 없습니다." }, { status: 400 });
  }

  const answerSnap = await answerRef(assignment.answerId).get();
  const answer = answerSnap.exists ? toAnswer(answerSnap) : null;
  if (!answer || answer.status !== "submitted") {
    return Response.json({ error: "학생이 아직 제출하지 않았습니다." }, { status: 400 });
  }

  const [univSnap, questionSnap, analysisSnap] = await Promise.all([
    universityRef(assignment.univId).get(),
    questions(assignment.univId, assignment.examId).doc(assignment.questionId).get(),
    analysisRef(assignment.univId, assignment.examId).get(),
  ]);
  if (!univSnap.exists || !questionSnap.exists) {
    return Response.json({ error: "문항을 찾지 못했습니다." }, { status: 404 });
  }
  if (!analysisSnap.exists || analysisSnap.data()?.status !== "confirmed") {
    return Response.json(
      { error: "이 기출의 채점 기준이 아직 확정되지 않았습니다. 기출 화면에서 확정하세요." },
      { status: 409 },
    );
  }

  // 다시 돌리는 경우 기존 문서를 재사용해 학생 화면의 링크가 바뀌지 않게 한다.
  const ref = assignment.correctionId ? correctionRef(assignment.correctionId) : corrections().doc();
  const base = {
    answerId: answer.id,
    assignmentId: assignment.id,
    studentId: assignment.studentId,
    univId: assignment.univId,
    examId: assignment.examId,
    questionId: assignment.questionId,
    published: false,
    teacherEdited: false,
    error: null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(
    { ...base, status: "running", createdAt: FieldValue.serverTimestamp(), publishedAt: null },
    { merge: true },
  );
  await assignmentRef(assignment.id).update({ status: "correcting", correctionId: ref.id });

  const input = {
    university: toUniversity(univSnap).name,
    examTitle: assignment.examTitle,
    question: toQuestion(questionSnap),
    analysis: toAnalysis(analysisSnap, assignment.univId),
    answer: answer.text,
    charCount: answer.charCount,
    charCountNoSpace: answer.charCountNoSpace,
  };

  // 응답을 보낸 뒤에 이어서 돌린다. 결과는 Firestore 에 쓴다.
  after(async () => {
    try {
      const result = await correctAnswer(input);

      await ref.update({
        status: "done",
        scores: result.scores,
        inlineComments: result.inlineComments,
        overall: result.overall,
        revisedExample: result.revisedExample,
        usage: result.usage,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await assignmentRef(assignment.id).update({ status: "corrected" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "첨삭에 실패했습니다.";
      await ref.update({
        status: "error",
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await assignmentRef(assignment.id).update({ status: "submitted" });
    }
  });

  return Response.json({ correction: toCorrection(await ref.get()) });
}
