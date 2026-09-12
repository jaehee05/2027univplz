import "server-only";

import type { DocumentSnapshot } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { toIso } from "@/lib/exam/store";
import type { LengthRule } from "@/lib/manuscript/spec";
import type {
  Answer,
  Assignment,
  AssignmentQuestion,
  AssignmentStatus,
  Correction,
  StudentRow,
} from "@/lib/types/work";

export const assignments = () => adminDb().collection("assignments");
export const assignmentRef = (id: string) => assignments().doc(id);
export const answers = () => adminDb().collection("answers");
export const answerRef = (id: string) => answers().doc(id);
export const corrections = () => adminDb().collection("corrections");
export const correctionRef = (id: string) => corrections().doc(id);
export const users = () => adminDb().collection("users");

function toAssignmentQuestion(raw: Record<string, unknown>): AssignmentQuestion {
  return {
    questionId: String(raw.questionId ?? ""),
    number: String(raw.number ?? ""),
    prompt: String(raw.prompt ?? ""),
    charTarget: (raw.charTarget as number | null) ?? null,
    tolerance: (raw.tolerance as number | undefined) ?? 0.1,
    charMin: (raw.charMin as number | null) ?? null,
    charMax: (raw.charMax as number | null) ?? null,
    points: (raw.points as number | null) ?? null,
  };
}

export function toAssignment(snap: DocumentSnapshot): Assignment {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    studentId: data.studentId,
    studentName: data.studentName ?? "",
    univId: data.univId,
    univName: data.univName ?? "",
    examId: data.examId,
    examTitle: data.examTitle ?? "",
    questions: (data.questions ?? []).map(toAssignmentQuestion),
    assignedBy: data.assignedBy,
    selfPractice: data.studentId === data.assignedBy,
    dueAt: toIso(data.dueAt),
    status: data.status ?? "assigned",
    submittedAt: toIso(data.submittedAt),
    createdAt: toIso(data.createdAt),
  };
}

export function toAnswer(snap: DocumentSnapshot): Answer {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    assignmentId: data.assignmentId,
    questionId: data.questionId ?? "",
    studentId: data.studentId,
    text: data.text ?? "",
    charCount: data.charCount ?? 0,
    charCountNoSpace: data.charCountNoSpace ?? 0,
    status: data.status ?? "draft",
    updatedAt: toIso(data.updatedAt),
    submittedAt: toIso(data.submittedAt),
  };
}

export function toCorrection(snap: DocumentSnapshot): Correction {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    answerId: data.answerId,
    assignmentId: data.assignmentId,
    studentId: data.studentId,
    univId: data.univId,
    examId: data.examId,
    questionId: data.questionId,
    status: data.status ?? "queued",
    scores: data.scores ?? { items: [], deductions: [], total: 0 },
    inlineComments: data.inlineComments ?? [],
    overall: data.overall ?? { summary: "", strengths: [], improvements: [], nextSteps: [] },
    revisedExample: data.revisedExample ?? "",
    teacherEdited: data.teacherEdited ?? false,
    published: data.published ?? false,
    error: data.error ?? null,
    usage: data.usage ?? undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    publishedAt: toIso(data.publishedAt),
  };
}

/**
 * 목록 조회는 where + orderBy 를 같이 쓰면 복합 인덱스가 필요해서,
 * 한 선생님 · 한 학생이 가질 만한 양(수백 건)을 받아 메모리에서 정렬한다.
 */
function byCreatedDesc<T extends { createdAt: string | null }>(rows: T[]): T[] {
  return rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function listAssignmentsFor(
  field: "assignedBy" | "studentId",
  uid: string,
): Promise<Assignment[]> {
  const snap = await assignments().where(field, "==", uid).limit(500).get();
  return byCreatedDesc(snap.docs.map(toAssignment));
}

export async function listStudents(teacherId: string): Promise<StudentRow[]> {
  const [studentSnap, assignmentSnap] = await Promise.all([
    users().where("teacherId", "==", teacherId).limit(500).get(),
    assignments().where("assignedBy", "==", teacherId).limit(500).get(),
  ]);

  const counts = new Map<string, { total: number; submitted: number }>();
  for (const doc of assignmentSnap.docs) {
    const data = doc.data();
    const entry = counts.get(data.studentId) ?? { total: 0, submitted: 0 };
    entry.total += 1;
    if (data.status !== "assigned" && data.status !== "writing") entry.submitted += 1;
    counts.set(data.studentId, entry);
  }

  return studentSnap.docs
    .map((doc) => {
      const data = doc.data();
      const count = counts.get(doc.id) ?? { total: 0, submitted: 0 };
      return {
        uid: doc.id,
        email: data.email ?? "",
        displayName: data.displayName ?? "",
        active: data.active ?? true,
        createdAt: toIso(data.createdAt),
        assignmentCount: count.total,
        submittedCount: count.submitted,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
}

/* ── 시험지 하나에 딸린 답안 · 첨삭 ──────────────────────── */

export async function listAnswersOf(assignmentId: string): Promise<Answer[]> {
  const snap = await answers().where("assignmentId", "==", assignmentId).limit(50).get();
  return snap.docs.map(toAnswer);
}

export async function listCorrectionsOf(assignmentId: string): Promise<Correction[]> {
  const snap = await corrections().where("assignmentId", "==", assignmentId).limit(50).get();
  return snap.docs.map(toCorrection);
}

/** 문항 하나의 답안. 과제를 낼 때 문항마다 하나씩 미리 만들어 둔다. */
export async function answerOf(
  assignmentId: string,
  questionId: string,
): Promise<Answer | null> {
  const rows = await listAnswersOf(assignmentId);
  return rows.find((row) => row.questionId === questionId) ?? null;
}

export async function correctionOf(
  assignmentId: string,
  questionId: string,
): Promise<Correction | null> {
  const rows = await listCorrectionsOf(assignmentId);
  return rows.find((row) => row.questionId === questionId) ?? null;
}

/** 한 학생 · 한 선생님이 가진 답안과 첨삭을 과제별로 묶어 둔다. 목록 화면에서 쓴다. */
export async function groupWorkBy(
  field: "studentId" | "assignedBy",
  uid: string,
): Promise<{
  answers: Map<string, Answer[]>;
  corrections: Map<string, Correction[]>;
}> {
  const [answerSnap, correctionSnap] = await Promise.all([
    answers().where(field, "==", uid).limit(2000).get(),
    corrections().where(field, "==", uid).limit(2000).get(),
  ]);

  const byAssignment = <T extends { assignmentId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.assignmentId) ?? [];
      list.push(row);
      map.set(row.assignmentId, list);
    }
    return map;
  };

  return {
    answers: byAssignment(answerSnap.docs.map(toAnswer)),
    corrections: byAssignment(correctionSnap.docs.map(toCorrection)),
  };
}

/** 과제 하나를 문항별로 늘어놓은 것. 화면은 거의 이 모양으로 그린다. */
export interface WorkRow {
  question: AssignmentQuestion;
  answer: Answer | null;
  correction: Correction | null;
}

export function workRows(
  assignment: Assignment,
  answerRows: Answer[],
  correctionRows: Correction[],
): WorkRow[] {
  return assignment.questions.map((question) => ({
    question,
    answer: answerRows.find((row) => row.questionId === question.questionId) ?? null,
    correction: correctionRows.find((row) => row.questionId === question.questionId) ?? null,
  }));
}

/**
 * 문항별 상태를 모아 시험지 하나의 상태를 낸다.
 * 제출과 공개는 시험지 단위라 문항이 엇갈리는 일이 없어야 한다.
 */
export function deriveStatus(rows: WorkRow[]): AssignmentStatus {
  if (rows.length === 0) return "assigned";

  const corrections = rows.map((row) => row.correction);
  if (corrections.every((c) => c?.published)) return "published";
  if (corrections.some((c) => c?.status === "running" || c?.status === "queued")) {
    return "correcting";
  }
  if (corrections.every((c) => c?.status === "done")) return "corrected";

  if (rows.every((row) => row.answer?.status === "submitted")) return "submitted";
  if (rows.some((row) => (row.answer?.text.trim().length ?? 0) > 0)) return "writing";
  return "assigned";
}

/** 과제 문서의 status 를 실제 상태에 맞춘다. */
export async function refreshStatus(assignmentId: string): Promise<AssignmentStatus> {
  const snap = await assignmentRef(assignmentId).get();
  if (!snap.exists) return "assigned";

  const assignment = toAssignment(snap);
  const [answerRows, correctionRows] = await Promise.all([
    listAnswersOf(assignmentId),
    listCorrectionsOf(assignmentId),
  ]);
  const status = deriveStatus(workRows(assignment, answerRows, correctionRows));

  if (status !== assignment.status) {
    await assignmentRef(assignmentId).update({ status });
  }
  return status;
}

export function lengthRuleOf(question: AssignmentQuestion): LengthRule | null {
  return question.charTarget
    ? {
        target: question.charTarget,
        tolerance: question.tolerance,
        min: question.charMin,
        max: question.charMax,
      }
    : null;
}
