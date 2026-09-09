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
  fileName: z.string().min(1).max(200),
  size: z.number().int().min(1),
});

const patchSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  title: z.string().trim().min(1).max(60).optional(),
  session: z.string().trim().max(30).nullable().optional(),
  /** 업로드를 마친 뒤 어떤 파일이 올라갔는지 알려 준다. */
  pdf: pdfSchema.optional(),
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

  const { pdf, ...rest } = parsed.data;
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
      uploadedAt: FieldValue.serverTimestamp(),
      // 새 파일이 올라왔으니 이전 추출 결과는 무효다.
      extraction: null,
    };
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
  if (!(await ref.get()).exists) {
    return Response.json({ error: "없는 기출입니다." }, { status: 404 });
  }

  await adminBucket()
    .deleteFiles({ prefix: `exams/${univId}/${examId}/` })
    .catch(() => undefined);
  // 하위 컬렉션(questions · extractions)까지 함께 지운다.
  await ref.firestore.recursiveDelete(ref);

  return Response.json({ exams: await listExams(univId) });
}
