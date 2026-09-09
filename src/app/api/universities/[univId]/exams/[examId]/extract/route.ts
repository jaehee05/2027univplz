import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { examRef, extractionRef, toExam } from "@/lib/exam/store";
import { extractCached, joinPages } from "@/lib/docs/extract";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]/extract">;

// 스캔본이면 Claude 가 몇 분씩 걸린다.
export const maxDuration = 600;

const bodySchema = z.object({ kind: z.enum(["question", "solution"]) });

export async function POST(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { kind } = parsed.data;

  const ref = examRef(univId, examId);
  const snap = await ref.get();
  if (!snap.exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  const exam = toExam(snap, univId);
  const pdf = kind === "question" ? exam.questionPdf : exam.solutionPdf;
  if (!pdf) {
    return Response.json(
      {
        error:
          kind === "question" ? "문제 PDF 를 먼저 올려 주세요." : "해설 PDF 를 먼저 올려 주세요.",
      },
      { status: 400 },
    );
  }

  let document;
  try {
    document = await extractCached(pdf.storagePath, pdf.fileName, `${exam.year} ${exam.title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 를 읽지 못했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }

  // 한 PDF 안에서 이 자료가 차지하는 쪽만 잘라 쓴다.
  const text = joinPages(document.pageTexts, pdf.pageFrom, pdf.pageTo);
  const usedPages =
    pdf.pageFrom || pdf.pageTo
      ? Math.min(document.pageTexts.length, pdf.pageTo ?? document.pageTexts.length) -
        Math.max(1, pdf.pageFrom ?? 1) +
        1
      : document.pageTexts.length;

  const rangeNote =
    pdf.pageFrom || pdf.pageTo
      ? ` 전체 ${document.pageTexts.length}쪽 중 ${pdf.pageFrom ?? 1}~${pdf.pageTo ?? document.pageTexts.length}쪽만 썼습니다.`
      : "";

  const meta = {
    method: document.method,
    pages: usedPages,
    chars: text.length,
    note: `${document.note}${rangeNote}`,
  };

  await extractionRef(univId, examId, kind).set({
    text,
    method: meta.method,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await ref.update({
    [`${kind}Pdf.extraction`]: { ...meta, extractedAt: FieldValue.serverTimestamp() },
  });

  return Response.json({
    extraction: { ...meta, extractedAt: new Date().toISOString() },
    // 관리 화면에서 눈으로 확인할 수 있게 앞부분만 돌려준다.
    preview: text.slice(0, 2000),
  });
}
