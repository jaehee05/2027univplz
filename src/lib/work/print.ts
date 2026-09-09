import "server-only";

import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/dal";
import { questions, toQuestion } from "@/lib/exam/store";
import type { Question } from "@/lib/types/exam";
import type { Answer, Assignment, Correction } from "@/lib/types/work";
import {
  answerRef,
  assignmentRef,
  correctionRef,
  toAnswer,
  toAssignment,
  toCorrection,
} from "@/lib/work/store";

export interface PrintContext {
  assignment: Assignment;
  question: Question | null;
  answer: Answer | null;
  correction: Correction | null;
  isTeacher: boolean;
}

/**
 * 인쇄 화면이 필요한 것을 한 번에 모아 온다.
 * 볼 권한이 없으면 여기서 막는다 — 선생님, 또는 그 과제의 학생만 볼 수 있다.
 */
export async function loadForPrint(input: {
  assignmentId?: string;
  answerId?: string;
  correctionId?: string;
  /** 첨삭 결과지는 공개 전이면 학생에게 보이지 않는다 */
  requirePublished?: boolean;
}): Promise<PrintContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let assignmentId = input.assignmentId ?? null;
  let answer: Answer | null = null;
  let correction: Correction | null = null;

  if (input.correctionId) {
    const snap = await correctionRef(input.correctionId).get();
    if (!snap.exists) notFound();
    correction = toCorrection(snap);
    assignmentId = correction.assignmentId;
  }

  if (input.answerId) {
    const snap = await answerRef(input.answerId).get();
    if (!snap.exists) notFound();
    answer = toAnswer(snap);
    assignmentId = answer.assignmentId;
  }

  if (!assignmentId) notFound();

  const assignmentSnap = await assignmentRef(assignmentId).get();
  if (!assignmentSnap.exists) notFound();
  const assignment = toAssignment(assignmentSnap);

  const isTeacher = user.role === "teacher";
  if (!isTeacher && assignment.studentId !== user.uid) redirect("/dashboard");
  if (!isTeacher && input.requirePublished && !correction?.published) redirect("/dashboard");

  if (!answer && assignment.answerId) {
    const snap = await answerRef(assignment.answerId).get();
    if (snap.exists) answer = toAnswer(snap);
  }

  const questionSnap = await questions(assignment.univId, assignment.examId)
    .doc(assignment.questionId)
    .get();

  return {
    assignment,
    question: questionSnap.exists ? toQuestion(questionSnap) : null,
    answer,
    correction,
    isTeacher,
  };
}

export function lengthRuleOf(assignment: Assignment) {
  return assignment.charTarget
    ? { target: assignment.charTarget, tolerance: assignment.tolerance }
    : null;
}
