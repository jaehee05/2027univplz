import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { exams, examRef, extractionRef, listExams, universityRef } from "@/lib/exam/store";
import { extractPdfCached, joinPages } from "@/lib/pdf/extract";

type Ctx = RouteContext<"/api/universities/[univId]/intake/commit">;

export const maxDuration = 600;

const itemSchema = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(300),
  size: z.number().int().min(1),
  kind: z.enum(["question", "solution"]),
  pageFrom: z.number().int().min(1).nullable(),
  pageTo: z.number().int().min(1).nullable(),
  year: z.number().int().min(2000).max(2100),
  title: z.string().trim().min(1).max(60),
  session: z.string().trim().max(30).nullable(),
  /** 이미 있는 기출에 붙일 때 */
  examId: z.string().min(1).nullable(),
});

const bodySchema = z.object({ items: z.array(itemSchema).min(1).max(40) });

/** 선생님이 확인한 분류대로 기출을 만들고 PDF 를 붙인다. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const { univId } = await ctx.params;
  if (!(await universityRef(univId).get()).exists) {
    return Response.json({ error: "없는 대학입니다." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const existing = await listExams(univId);
  // 같은 (연도 · 이름 · 차수)면 하나의 기출로 묶는다.
  const keyOf = (item: { year: number; title: string; session: string | null }) =>
    `${item.year}|${item.title}|${item.session ?? ""}`;

  const byKey = new Map<string, string>();
  for (const exam of existing) {
    byKey.set(keyOf({ year: exam.year, title: exam.title, session: exam.session ?? null }), exam.id);
  }

  const touched = new Set<string>();
  const warnings: string[] = [];

  for (const item of parsed.data.items) {
    const key = keyOf(item);
    let examId = item.examId ?? byKey.get(key) ?? null;

    if (!examId) {
      const created = await exams(univId).add({
        year: item.year,
        title: item.title,
        session: item.session,
        questionPdf: null,
        solutionPdf: null,
        questionCount: 0,
        analysisStatus: "none",
        createdAt: FieldValue.serverTimestamp(),
      });
      examId = created.id;
      byKey.set(key, examId);
    }

    const ref = examRef(univId, examId);
    const snap = await ref.get();
    if (!snap.exists) {
      warnings.push(`${item.fileName}: 기출을 찾지 못해 건너뛰었습니다.`);
      continue;
    }
    if (snap.data()?.[`${item.kind}Pdf`]) {
      const label = item.kind === "question" ? "문제" : "해설";
      warnings.push(
        `${item.year}학년도 ${item.title} 의 ${label} 자리에 이미 파일이 있어 덮어썼습니다.`,
      );
    }

    await ref.update({
      [`${item.kind}Pdf`]: {
        storagePath: item.storagePath,
        fileName: item.fileName,
        size: item.size,
        pageFrom: item.pageFrom,
        pageTo: item.pageTo,
        uploadedAt: FieldValue.serverTimestamp(),
        // 붙이는 쪽 범위가 달라졌으니 이전 추출은 무효다.
        extraction: null,
      },
    });
    // 분류할 때 읽어 둔 결과가 캐시에 있으므로 추출까지 여기서 끝낸다.
    try {
      const document = await extractPdfCached(item.storagePath, `${item.year} ${item.title}`);
      const text = joinPages(document.pageTexts, item.pageFrom, item.pageTo);
      const from = Math.max(1, item.pageFrom ?? 1);
      const to = Math.min(document.pageTexts.length, item.pageTo ?? document.pageTexts.length);

      await extractionRef(univId, examId, item.kind).set({
        text,
        method: document.method,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await ref.update({
        [`${item.kind}Pdf.extraction`]: {
          method: document.method,
          pages: to - from + 1,
          chars: text.length,
          note:
            item.pageFrom || item.pageTo
              ? `${document.note} 전체 ${document.pageTexts.length}쪽 중 ${from}~${to}쪽만 썼습니다.`
              : document.note,
          extractedAt: FieldValue.serverTimestamp(),
        },
      });
    } catch (error) {
      warnings.push(
        `${item.fileName}: 등록은 했지만 글자 추출에 실패했습니다 — ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }. 기출 화면에서 다시 시도하세요.`,
      );
    }

    touched.add(examId);
  }

  return Response.json({
    created: touched.size,
    warnings,
    exams: await listExams(univId),
  });
}
