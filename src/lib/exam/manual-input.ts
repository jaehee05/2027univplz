import "server-only";

import type { AnalyzeInput, ParseInput } from "@/lib/anthropic/exam-analysis";
import {
  examRef,
  listQuestions,
  readExtractedText,
  toExam,
  toUniversity,
  universityRef,
} from "@/lib/exam/store";

type Loaded<T> = { ok: true; input: T } | { ok: false; status: number; error: string };

/** 문항 뽑기·기준 분석에 필요한 것을 모아 온다. API 로 돌릴 때와 직접 돌릴 때가 같은 값을 쓴다. */
export async function loadExamInput(
  univId: string,
  examId: string,
): Promise<Loaded<ParseInput & AnalyzeInput>> {
  const [univSnap, examSnap] = await Promise.all([
    universityRef(univId).get(),
    examRef(univId, examId).get(),
  ]);
  if (!univSnap.exists || !examSnap.exists) {
    return { ok: false, status: 404, error: "없는 기출입니다." };
  }

  const [examText, solutionText, saved] = await Promise.all([
    readExtractedText(univId, examId, "question"),
    readExtractedText(univId, examId, "solution"),
    listQuestions(univId, examId),
  ]);

  if (examText.trim().length < 100) {
    return { ok: false, status: 400, error: "문제 PDF 의 텍스트 추출을 먼저 끝내 주세요." };
  }

  const exam = toExam(examSnap, univId);
  return {
    ok: true,
    input: {
      university: toUniversity(univSnap).name,
      year: exam.year,
      examText,
      solutionText,
      questionNumbers: saved.map((question) => question.number),
    },
  };
}
