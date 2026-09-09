import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { classifyPdf } from "@/lib/anthropic/classify";
import { adminBucket } from "@/lib/firebase/admin";
import { toUniversity, universityRef } from "@/lib/exam/store";
import { extractPdfCached, pageDigest } from "@/lib/pdf/extract";

type Ctx = RouteContext<"/api/universities/[univId]/intake">;

export const maxDuration = 600;

const bodySchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(300),
  size: z.number().int().min(1),
});

/**
 * 올린 PDF 한 개가 무엇인지 판단한다.
 * 여러 개를 올릴 때는 클라이언트가 파일마다 한 번씩 부른다 — 진행 상황을 보여 주기 위해서다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId } = await ctx.params;
  const univSnap = await universityRef(univId).get();
  if (!univSnap.exists) {
    return Response.json({ error: "없는 대학입니다." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { storagePath, fileName, size } = parsed.data;

  const [exists] = await adminBucket().file(storagePath).exists();
  if (!exists) {
    return Response.json({ error: "업로드된 파일을 찾지 못했습니다." }, { status: 400 });
  }

  try {
    const document = await extractPdfCached(storagePath, fileName);
    const result = await classifyPdf({
      fileName,
      pageCount: document.pageTexts.length,
      digest: pageDigest(document.pageTexts),
    });

    return Response.json({
      file: { storagePath, fileName, size, pageCount: document.pageTexts.length },
      extraction: { method: document.method, note: document.note },
      ...result,
      // 이 대학 화면에서 올린 것이니 대학은 화면 쪽을 따른다.
      university: toUniversity(univSnap).name,
      detectedUniversity: result.university,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 를 판단하지 못했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
