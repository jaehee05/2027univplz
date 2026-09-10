import { apiTeacher } from "@/lib/auth/dal";
import { parseQuestions } from "@/lib/anthropic/exam-analysis";
import { FieldValue } from "firebase-admin/firestore";

import {
  examRef,
  readExtractedText,
  toExam,
  toUniversity,
  universityRef,
} from "@/lib/exam/store";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/parse-questions">;

export const maxDuration = 600;

/**
 * 문제지 텍스트에서 문항을 뽑는다. 저장은 하지 않고 결과만 돌려주어,
 * 선생님이 화면에서 확인·수정한 뒤 PUT /questions 로 확정하게 한다.
 */
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
  const examText = await readExtractedText(univId, examId, "question");

  if (examText.trim().length < 100) {
    return Response.json(
      { error: "문제 PDF 의 텍스트 추출을 먼저 끝내 주세요." },
      { status: 400 },
    );
  }

  try {
    const result = await parseQuestions({
      university: university.name,
      year: exam.year,
      examText,
    });

    // 문제지 쪽에 토큰이 얼마나 드는지 나중에 볼 수 있게 남긴다.
    await examRef(univId, examId)
      .update({ parseUsage: { ...result.usage, at: FieldValue.serverTimestamp() } })
      .catch(() => undefined);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "문항 파싱에 실패했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
