import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { classifyDocument } from "@/lib/anthropic/classify";
import { adminBucket } from "@/lib/firebase/admin";
import { listUniversities } from "@/lib/exam/store";
import { extractCached, isSupportedDocument, pageDigest } from "@/lib/docs/extract";

export const maxDuration = 600;

const bodySchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(300),
  size: z.number().int().min(1),
});

/**
 * 올린 파일 한 개가 어느 대학 · 어느 연도 · 무엇인지 판단한다.
 * 여러 개를 올릴 때는 클라이언트가 파일마다 부르되 몇 개씩 동시에 부른다.
 */
export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { storagePath, fileName, size } = parsed.data;

  if (!isSupportedDocument(fileName)) {
    return Response.json({ error: `${fileName} 은 PDF·HWPX 가 아닙니다.` }, { status: 400 });
  }

  const [exists] = await adminBucket().file(storagePath).exists();
  if (!exists) {
    return Response.json({ error: "업로드된 파일을 찾지 못했습니다." }, { status: 400 });
  }

  try {
    const universities = await listUniversities();
    const document = await extractCached(storagePath, fileName, fileName);
    const result = await classifyDocument({
      fileName,
      pageCount: document.pageTexts.length,
      digest: pageDigest(document.pageTexts),
      universities: universities.map((univ) => ({ id: univ.id, name: univ.name })),
    });

    return Response.json({
      file: { storagePath, fileName, size, pageCount: document.pageTexts.length },
      extraction: { method: document.method, note: document.note },
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "파일을 판단하지 못했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
