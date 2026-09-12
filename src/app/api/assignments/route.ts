import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher, apiUser } from "@/lib/auth/dal";
import { examRef, listQuestions, toExam, toUniversity, universityRef } from "@/lib/exam/store";
import type { AssignmentQuestion } from "@/lib/types/work";
import { answers, assignments, listAssignmentsFor, users } from "@/lib/work/store";

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
  /** YYYY-MM-DD */
  dueAt: z.string().trim().max(10).nullable().optional(),
});

/**
 * 과제 배정 — 단위는 **시험지 하나**다. 그 시험지의 문항을 전부 낸다.
 * 문항마다 빈 답안을 미리 만들어 둔다. 학생이 들어오는 순간 바로 쓸 수 있게.
 */
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
  const { studentIds, univId, examId, dueAt } = parsed.data;

  const [univSnap, examSnap, examQuestions] = await Promise.all([
    universityRef(univId).get(),
    examRef(univId, examId).get(),
    listQuestions(univId, examId),
  ]);
  if (!univSnap.exists || !examSnap.exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }
  if (examQuestions.length === 0) {
    return Response.json(
      { error: "이 기출에 저장된 문항이 없습니다. 문항을 먼저 저장하세요." },
      { status: 400 },
    );
  }

  const university = toUniversity(univSnap);
  const exam = toExam(examSnap, univId);

  // 기출을 나중에 고쳐도 이미 내준 과제의 조건은 그대로 남아야 한다.
  const copied: AssignmentQuestion[] = examQuestions.map((question) => ({
    questionId: question.id,
    number: question.number,
    prompt: question.prompt,
    charTarget: question.charTarget,
    tolerance: question.tolerance,
    charMin: question.charMin,
    charMax: question.charMax,
    points: question.points,
  }));

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
      .filter((doc) => doc.data().examId === examId)
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

    const ref = assignments().doc();
    batch.set(ref, {
      studentId: snap.id,
      studentName: name,
      univId,
      univName: university.name,
      examId,
      examTitle: `${exam.year}학년도 ${exam.title}${exam.session ? ` · ${exam.session}` : ""}`,
      questions: copied,
      assignedBy: auth.user.uid,
      dueAt: dueAt ? Timestamp.fromDate(new Date(`${dueAt}T23:59:59+09:00`)) : null,
      status: "assigned",
      submittedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    for (const question of copied) {
      batch.set(answers().doc(), {
        assignmentId: ref.id,
        questionId: question.questionId,
        studentId: snap.id,
        // 선생님 목록 화면이 답안을 한 번에 읽을 수 있게 복사해 둔다.
        assignedBy: auth.user.uid,
        text: "",
        charCount: 0,
        charCountNoSpace: 0,
        status: "draft",
        updatedAt: FieldValue.serverTimestamp(),
        submittedAt: null,
      });
    }
    created += 1;
  });

  if (created > 0) await batch.commit();

  return Response.json({
    created,
    skipped,
    questionCount: copied.length,
    assignments: await listAssignmentsFor("assignedBy", auth.user.uid),
  });
}
