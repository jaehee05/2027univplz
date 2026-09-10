import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher, apiUser } from "@/lib/auth/dal";
import { examRef, questions, toExam, toQuestion, toUniversity, universityRef } from "@/lib/exam/store";
import { assignments, listAssignmentsFor, users } from "@/lib/work/store";

/** 선생님은 자기가 낸 과제를, 학생은 자기 과제를 본다. */
export async function GET() {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const field = auth.user.role === "teacher" ? "assignedBy" : "studentId";
  return Response.json({ assignments: await listAssignmentsFor(field, auth.user.uid) });
}

const bodySchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(100),
  univId: z.string().min(1),
  examId: z.string().min(1),
  questionId: z.string().min(1),
  /** YYYY-MM-DD */
  dueAt: z.string().trim().max(10).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const { studentIds, univId, examId, questionId, dueAt } = parsed.data;

  const [univSnap, examSnap, questionSnap] = await Promise.all([
    universityRef(univId).get(),
    examRef(univId, examId).get(),
    questions(univId, examId).doc(questionId).get(),
  ]);
  if (!univSnap.exists || !examSnap.exists || !questionSnap.exists) {
    return Response.json({ error: "없는 문항입니다." }, { status: 404 });
  }

  const university = toUniversity(univSnap);
  const exam = toExam(examSnap, univId);
  const question = toQuestion(questionSnap);

  // 내 학생인지 확인한다. 선생님 자신은 연습용으로 낼 수 있다.
  const studentDocs = await Promise.all(studentIds.map((uid) => users().doc(uid).get()));
  const invalid = studentDocs.find(
    (snap) =>
      !snap.exists ||
      (snap.id !== auth.user.uid && snap.data()?.teacherId !== auth.user.uid),
  );
  if (invalid) {
    return Response.json({ error: "내 학생이 아닌 계정이 있습니다." }, { status: 403 });
  }

  const existing = await assignments().where("assignedBy", "==", auth.user.uid).limit(500).get();
  const already = new Set(
    existing.docs
      .filter((doc) => doc.data().questionId === questionId && doc.data().examId === examId)
      .map((doc) => doc.data().studentId as string),
  );

  const batch = assignments().firestore.batch();
  let created = 0;
  const skipped: string[] = [];

  studentDocs.forEach((snap) => {
    const name = snap.data()?.displayName ?? "";
    if (already.has(snap.id)) {
      skipped.push(name);
      return;
    }
    batch.set(assignments().doc(), {
      studentId: snap.id,
      studentName: name,
      univId,
      univName: university.name,
      examId,
      examTitle: `${exam.year}학년도 ${exam.title}${exam.session ? ` · ${exam.session}` : ""}`,
      questionId,
      questionNumber: question.number,
      // 기출을 나중에 고쳐도 이미 내준 과제의 조건은 그대로 남아야 한다.
      questionPrompt: question.prompt,
      charTarget: question.charTarget,
      tolerance: question.tolerance,
      assignedBy: auth.user.uid,
      dueAt: dueAt ? Timestamp.fromDate(new Date(`${dueAt}T23:59:59+09:00`)) : null,
      status: "assigned",
      answerId: null,
      correctionId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    created += 1;
  });

  if (created > 0) await batch.commit();

  return Response.json({
    created,
    skipped,
    assignments: await listAssignmentsFor("assignedBy", auth.user.uid),
  });
}
