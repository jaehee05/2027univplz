import "server-only";

import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/dal";
import { listQuestions } from "@/lib/exam/store";
import type { Question } from "@/lib/types/exam";
import type { Assignment } from "@/lib/types/work";
import {
  assignmentRef,
  listAnswersOf,
  listCorrectionsOf,
  toAssignment,
  workRows,
  type WorkRow,
} from "@/lib/work/store";

/** 인쇄는 시험지 한 벌이 단위다. 문항별 줄에 원본 문항(제시문 포함)을 붙여 둔다. */
export interface PrintRow extends WorkRow {
  /** 기출에 저장된 원본 문항. 지워졌으면 null */
  source: Question | null;
}

export interface PrintContext {
  assignment: Assignment;
  rows: PrintRow[];
  isTeacher: boolean;
}

/**
 * 인쇄 화면이 필요한 것을 한 번에 모아 온다.
 * 볼 권한이 없으면 여기서 막는다 — 선생님, 또는 그 과제의 학생만 볼 수 있다.
 */
export async function loadForPrint(input: {
  assignmentId: string;
  /** 첨삭 결과지는 공개 전이면 학생에게 보이지 않는다 */
  requirePublished?: boolean;
}): Promise<PrintContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const snap = await assignmentRef(input.assignmentId).get();
  if (!snap.exists) notFound();
  const assignment = toAssignment(snap);

  const isTeacher = user.role === "teacher";
  if (!isTeacher && assignment.studentId !== user.uid) redirect("/dashboard");

  const [answerRows, correctionRows, sourceQuestions] = await Promise.all([
    listAnswersOf(assignment.id),
    listCorrectionsOf(assignment.id),
    listQuestions(assignment.univId, assignment.examId),
  ]);

  const rows: PrintRow[] = workRows(assignment, answerRows, correctionRows).map((row) => ({
    ...row,
    source: sourceQuestions.find((q) => q.id === row.question.questionId) ?? null,
  }));

  if (!isTeacher && input.requirePublished && !rows.every((row) => row.correction?.published)) {
    redirect("/dashboard");
  }

  return { assignment, rows, isTeacher };
}
