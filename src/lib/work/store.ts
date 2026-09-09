import "server-only";

import type { DocumentSnapshot } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { toIso } from "@/lib/exam/store";
import type {
  Answer,
  Assignment,
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
    questionId: data.questionId,
    questionNumber: data.questionNumber ?? "",
    questionPrompt: data.questionPrompt ?? "",
    charTarget: data.charTarget ?? null,
    tolerance: data.tolerance ?? 0.1,
    assignedBy: data.assignedBy,
    dueAt: toIso(data.dueAt),
    status: data.status ?? "assigned",
    answerId: data.answerId ?? null,
    correctionId: data.correctionId ?? null,
    createdAt: toIso(data.createdAt),
  };
}

export function toAnswer(snap: DocumentSnapshot): Answer {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    assignmentId: data.assignmentId,
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

/** 과제 하나에 딸린 답안과 첨삭을 함께 읽는다. */
export async function loadWork(assignment: Assignment): Promise<{
  answer: Answer | null;
  correction: Correction | null;
}> {
  const [answerSnap, correctionSnap] = await Promise.all([
    assignment.answerId ? answerRef(assignment.answerId).get() : Promise.resolve(null),
    assignment.correctionId ? correctionRef(assignment.correctionId).get() : Promise.resolve(null),
  ]);

  return {
    answer: answerSnap?.exists ? toAnswer(answerSnap) : null,
    correction: correctionSnap?.exists ? toCorrection(correctionSnap) : null,
  };
}
