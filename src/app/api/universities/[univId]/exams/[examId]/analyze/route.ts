import { FieldValue } from "firebase-admin/firestore";

import { apiTeacher } from "@/lib/auth/dal";
import { analyzeRubric } from "@/lib/anthropic/exam-analysis";
import {
  analysisRef,
  examRef,
  listQuestions,
  readExtractedText,
  toAnalysis,
  toExam,
  toUniversity,
  universityRef,
} from "@/lib/exam/store";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/analyze">;

export const maxDuration = 600;

/** 채점 기준 초안을 만든다. 확정 전까지는 draft 로만 저장한다. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;

  const [univSnap, examSnap] = await Promise.all([
    universityRef(univId).get(),
    examRef(univId, examId).get(),
  ]);
  if (!univSnap.exists || !examSnap.exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  const university = toUniversity(univSnap);
  const exam = toExam(examSnap, univId);

  const [examText, solutionText, saved] = await Promise.all([
    readExtractedText(univId, examId, "question"),
    readExtractedText(univId, examId, "solution"),
    listQuestions(univId, examId),
  ]);

  if (examText.trim().length < 100) {
    return Response.json(
      { error: "문제 PDF 의 텍스트 추출을 먼저 끝내 주세요." },
      { status: 400 },
    );
  }

  const ref = analysisRef(univId, examId);
  const previous = await ref.get();

  // 이미 확정한 기준은 덮어쓰지 않는다.
  if (previous.exists && previous.data()?.status === "confirmed") {
    return Response.json(
      { error: "이미 확정된 채점 기준입니다. 확정을 푼 뒤 다시 분석하세요." },
      { status: 409 },
    );
  }

  try {
    const { analysis, usage } = await analyzeRubric({
      university: university.name,
      year: exam.year,
      examText,
      solutionText,
      questionNumbers: saved.map((question) => question.number),
    });

    await ref.set({
      scope: "exam",
      ...analysis,
      status: "draft",
      version: (previous.data()?.version ?? 0) + 1,
      usage,
      updatedAt: FieldValue.serverTimestamp(),
      confirmedAt: null,
    });
    await examRef(univId, examId).update({ analysisStatus: "draft" });

    return Response.json({ analysis: toAnalysis(await ref.get(), univId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "채점 기준 분석에 실패했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
