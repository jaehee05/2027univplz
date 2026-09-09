import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { adminBucket } from "@/lib/firebase/admin";
import { examRef, listExams, listQuestions, toExam } from "@/lib/exam/store";

type Ctx = RouteContext<"/api/universities/[univId]/exams/[examId]">;

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const snap = await examRef(univId, examId).get();
  if (!snap.exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  return Response.json({
    exam: toExam(snap, univId),
    questions: await listQuestions(univId, examId),
  });
}

const pdfSchema = z.object({
  kind: z.enum(["question", "solution"]),
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(300),
  size: z.number().int().min(1),
  /** 한 PDF 에 여러 자료가 있을 때 쓰는 쪽 범위. 없으면 전체 */
  pageFrom: z.number().int().min(1).nullable().default(null),
  pageTo: z.number().int().min(1).nullable().default(null),
});

/** 올린 파일은 그대로 두고 쓰는 쪽 범위만 고친다. */
const rangeSchema = z.object({
  kind: z.enum(["question", "solution"]),
  pageFrom: z.number().int().min(1).nullable(),
  pageTo: z.number().int().min(1).nullable(),
});

const patchSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  title: z.string().trim().min(1).max(60).optional(),
  session: z.string().trim().max(30).nullable().optional(),
  /** 업로드를 마친 뒤 어떤 파일이 올라갔는지 알려 준다. */
  pdf: pdfSchema.optional(),
  range: rangeSchema.optional(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const ref = examRef(univId, examId);
  if (!(await ref.get()).exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { pdf, range, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };

  if (pdf) {
    // 올라온 파일이 실제로 있는지 확인한 뒤 기록한다.
    const [exists] = await adminBucket().file(pdf.storagePath).exists();
    if (!exists) {
      return Response.json(
        { error: "업로드된 파일을 찾지 못했습니다. 다시 올려 주세요." },
        { status: 400 },
      );
    }
    update[`${pdf.kind}Pdf`] = {
      storagePath: pdf.storagePath,
      fileName: pdf.fileName,
      size: pdf.size,
      pageFrom: pdf.pageFrom,
      pageTo: pdf.pageTo,
      uploadedAt: FieldValue.serverTimestamp(),
      // 새 파일이 올라왔으니 이전 추출 결과는 무효다.
      extraction: null,
    };
  }

  if (range) {
    update[`${range.kind}Pdf.pageFrom`] = range.pageFrom;
    update[`${range.kind}Pdf.pageTo`] = range.pageTo;
    // 범위가 달라지면 다시 뽑아야 한다.
    update[`${range.kind}Pdf.extraction`] = null;
  }

  await ref.update(update);
  const snap = await ref.get();
  return Response.json({ exam: toExam(snap, univId), exams: await listExams(univId) });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId, examId } = await ctx.params;
  const ref = examRef(univId, examId);
  const snap = await ref.get();
  if (!snap.exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  const bucket = adminBucket();
  await bucket.deleteFiles({ prefix: `exams/${univId}/${examId}/` }).catch(() => undefined);

  // 여러 PDF 를 한꺼번에 올릴 때 쓴 파일은 _intake 아래에 있어서 위 prefix 로 안 지워진다.
  // 다른 기출이 같은 파일을 쓰고 있으면 남긴다 (한 PDF 를 문제 · 해설로 나눠 쓰는 경우).
  const exam = toExam(snap, univId);
  const mine = [exam.questionPdf?.storagePath, exam.solutionPdf?.storagePath].filter(
    (path): path is string => Boolean(path),
  );
  if (mine.length > 0) {
    const others = (await listExams(univId))
      .filter((other) => other.id !== examId)
      .flatMap((other) => [other.questionPdf?.storagePath, other.solutionPdf?.storagePath]);
    const stillUsed = new Set(others.filter(Boolean));

    await Promise.all(
      [...new Set(mine)]
        .filter((path) => !stillUsed.has(path))
        .flatMap((path) => [
          bucket.file(path).delete().catch(() => undefined),
          // 추출 결과 캐시도 함께 지운다.
          bucket.file(`${path}.pages.json`).delete().catch(() => undefined),
        ]),
    );
  }
  // 하위 컬렉션(questions · extractions)까지 함께 지운다.
  await ref.firestore.recursiveDelete(ref);

  return Response.json({ exams: await listExams(univId) });
}
