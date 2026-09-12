/**
 * 과제 단위를 문항에서 시험지로 옮긴다. npm run migrate:assignments
 *
 * 옛 모양: assignments/{id} 가 문항 하나를 가리키고(questionId · questionNumber · charTarget …),
 *          answerId · correctionId 로 답안과 첨삭을 하나씩 물고 있었다.
 * 새 모양: assignments/{id} 가 시험지 하나이고 questions[] 에 문항을 복사해 둔다.
 *          답안 · 첨삭은 questionId 로 자기 문항을 가리키고, assignmentId 로 묶인다.
 *
 * 같은 학생 · 같은 기출로 나뉘어 있던 옛 과제는 하나로 합친다.
 * 한 번 더 돌려도 탈이 없다(이미 옮긴 것은 건너뛴다). DRY=1 이면 무엇을 할지만 보여 준다.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

const DRY = Boolean(process.env.DRY);

interface OldAssignment {
  studentId: string;
  examId: string;
  questionId?: string;
  questionNumber?: string;
  questionPrompt?: string;
  charTarget?: number | null;
  tolerance?: number;
  charMin?: number | null;
  charMax?: number | null;
  answerId?: string | null;
  correctionId?: string | null;
  assignedBy: string;
  questions?: unknown[];
  createdAt?: FirebaseFirestore.Timestamp;
}

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  const snap = await db.collection("assignments").get();
  const old = snap.docs.filter((doc) => !(doc.data() as OldAssignment).questions);
  console.log(`과제 ${snap.size}건 · 옮길 것 ${old.length}건${DRY ? " (DRY)" : ""}`);

  // 같은 학생 · 같은 기출이면 한 시험지다. 가장 먼저 만든 것을 남기고 나머지를 합친다.
  const groups = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of old) {
    const data = doc.data() as OldAssignment;
    const key = `${data.studentId}|${data.examId}`;
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }

  for (const [key, docs] of groups) {
    docs.sort(
      (a, b) =>
        (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0),
    );
    const keep = docs[0];
    const data = keep.data() as OldAssignment;

    // 기출에 저장된 문항을 정본으로 삼되, 옛 과제가 들고 있던 조건을 우선한다.
    const examQuestions = await db
      .collection("universities")
      .doc(keep.data().univId)
      .collection("exams")
      .doc(data.examId)
      .collection("questions")
      .get();

    const byId = new Map(examQuestions.docs.map((doc) => [doc.id, doc.data()]));

    // 기출에서 문항이 지워진 옛 과제도 있다. 그때는 과제가 베껴 둔 조건만으로 되살린다 —
    // 학생이 쓴 답안과 첨삭이 딸려 있어 버릴 수 없다.
    const ids = examQuestions.docs.length
      ? examQuestions.docs.map((doc) => doc.id)
      : [...new Set(docs.map((one) => (one.data() as OldAssignment).questionId ?? ""))].filter(
          Boolean,
        );

    const copied = ids
      .map((id) => {
        const from = docs.find((one) => (one.data() as OldAssignment).questionId === id);
        const old = from?.data() as OldAssignment | undefined;
        const source = byId.get(id) ?? {};
        return {
          questionId: id,
          number: old?.questionNumber ?? source.number ?? "",
          prompt: old?.questionPrompt ?? source.prompt ?? "",
          charTarget: old?.charTarget ?? source.charTarget ?? null,
          tolerance: old?.tolerance ?? source.tolerance ?? 0.1,
          charMin: old?.charMin ?? source.charMin ?? null,
          charMax: old?.charMax ?? source.charMax ?? null,
          points: source.points ?? null,
        };
      })
      .sort((a, b) => a.number.localeCompare(b.number, "ko", { numeric: true }));

    console.log(
      `  ${key} → ${keep.id} · 문항 ${copied.length}개` +
        (docs.length > 1 ? ` (옛 과제 ${docs.length}건 합침)` : ""),
    );
    if (DRY) continue;

    await keep.ref.update({
      questions: copied,
      submittedAt: keep.data().submittedAt ?? null,
    });

    // 답안 · 첨삭에 questionId 와 assignedBy 를 채우고, 합친 과제 쪽 것을 옮겨 붙인다.
    for (const doc of docs) {
      const one = doc.data() as OldAssignment;
      for (const name of ["answers", "corrections"] as const) {
        const rows = await db.collection(name).where("assignmentId", "==", doc.id).get();
        for (const row of rows.docs) {
          await row.ref.update({
            assignmentId: keep.id,
            questionId: row.data().questionId ?? one.questionId ?? null,
            assignedBy: data.assignedBy,
          });
        }
      }
      if (doc.id !== keep.id) await doc.ref.delete();
    }
  }

  // 문항이 있는데 답안이 없는 자리를 메운다 — 학생이 들어오면 쓸 수 있어야 한다.
  if (!DRY) {
    for (const doc of (await db.collection("assignments").get()).docs) {
      const data = doc.data();
      const rows = await db.collection("answers").where("assignmentId", "==", doc.id).get();
      const have = new Set(rows.docs.map((row) => row.data().questionId));
      for (const question of data.questions ?? []) {
        if (have.has(question.questionId)) continue;
        await db.collection("answers").add({
          assignmentId: doc.id,
          questionId: question.questionId,
          studentId: data.studentId,
          assignedBy: data.assignedBy,
          text: "",
          charCount: 0,
          charCountNoSpace: 0,
          status: "draft",
          updatedAt: null,
          submittedAt: null,
        });
        console.log(`  빈 답안 채움: ${doc.id} · ${question.number}번`);
      }
    }
  }

  console.log("끝");
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
