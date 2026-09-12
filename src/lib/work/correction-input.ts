import "server-only";

import type { CorrectionInput } from "@/lib/anthropic/correct";
import {
  analysisRef,
  questions,
  toAnalysis,
  toQuestion,
  toUniversity,
  universityRef,
} from "@/lib/exam/store";
import type { Assignment, Answer, AssignmentQuestion } from "@/lib/types/work";
import { answerOf, assignmentRef, toAssignment } from "@/lib/work/store";

type Loaded =
  | {
      ok: true;
      input: CorrectionInput;
      assignment: Assignment;
      question: AssignmentQuestion;
      answer: Answer;
    }
  | { ok: false; status: number; error: string };

/**
 * 첨삭에 필요한 것(문항 · 확정 기준 · 제출된 답안)을 모아 온다.
 *
 * 첨삭은 **문항 하나**가 단위다 — 채점 기준이 문항마다 100점이라 섞을 수 없다.
 * 시험지 단위로 돌릴 때는 이 함수를 문항 수만큼 부른다.
 * API 로 돌릴 때와 선생님이 직접 돌린 결과를 받을 때가 같은 조건을 쓰도록 한곳에 둔다.
 */
export async function loadCorrectionInput(
  assignmentId: string,
  questionId: string,
  teacherUid: string,
): Promise<Loaded> {
  const snap = await assignmentRef(assignmentId).get();
  if (!snap.exists) return { ok: false, status: 404, error: "없는 과제입니다." };

  const assignment = toAssignment(snap);
  if (assignment.assignedBy !== teacherUid) {
    return { ok: false, status: 403, error: "내가 낸 과제가 아닙니다." };
  }

  const assigned = assignment.questions.find((row) => row.questionId === questionId);
  if (!assigned) {
    return { ok: false, status: 404, error: "이 과제에 없는 문항입니다." };
  }

  const answer = await answerOf(assignmentId, questionId);
  if (!answer || answer.status !== "submitted") {
    return {
      ok: false,
      status: 400,
      error: `${assigned.number}번 답안을 학생이 아직 제출하지 않았습니다.`,
    };
  }

  const [univSnap, questionSnap, analysisSnap] = await Promise.all([
    universityRef(assignment.univId).get(),
    questions(assignment.univId, assignment.examId).doc(questionId).get(),
    analysisRef(assignment.univId, assignment.examId).get(),
  ]);
  if (!univSnap.exists || !questionSnap.exists) {
    return { ok: false, status: 404, error: `${assigned.number}번 문항을 찾지 못했습니다.` };
  }
  if (!analysisSnap.exists || analysisSnap.data()?.status !== "confirmed") {
    return {
      ok: false,
      status: 409,
      error: "이 기출의 채점 기준이 아직 확정되지 않았습니다. 기출 화면에서 확정하세요.",
    };
  }

  return {
    ok: true,
    assignment,
    question: assigned,
    answer,
    input: {
      university: toUniversity(univSnap).name,
      examTitle: assignment.examTitle,
      question: toQuestion(questionSnap),
      analysis: toAnalysis(analysisSnap, assignment.univId),
      answer: answer.text,
      charCount: answer.charCount,
      charCountNoSpace: answer.charCountNoSpace,
    },
  };
}
