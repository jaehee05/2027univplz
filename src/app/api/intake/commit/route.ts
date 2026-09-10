import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { apiTeacher } from "@/lib/auth/dal";
import { exams, examRef, extractionRef, listExams, listUniversities } from "@/lib/exam/store";
import { extractCached, joinPages } from "@/lib/docs/extract";

export const maxDuration = 600;

const itemSchema = z.object({
  univId: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(300),
  size: z.number().int().min(1),
  kind: z.enum(["question", "solution"]),
  pageFrom: z.number().int().min(1).nullable(),
  pageTo: z.number().int().min(1).nullable(),
  year: z.number().int().min(2000).max(2100),
  title: z.string().trim().min(1).max(60),
  session: z.string().trim().max(30).nullable(),
});

const bodySchema = z.object({ items: z.array(itemSchema).min(1).max(60) });

/** 선생님이 확인한 분류대로 대학별 기출을 만들고 파일을 붙인다. */
export async function POST(request: Request) {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const known = new Map((await listUniversities()).map((univ) => [univ.id, univ]));
  const unknown = parsed.data.items.find((item) => !known.has(item.univId));
  if (unknown) {
    return Response.json({ error: `없는 대학입니다: ${unknown.univId}` }, { status: 400 });
  }

  /**
   * 같은 (대학 · 연도 · 차수)면 하나의 기출로 본다.
   * 제목은 넣지 않는다 — 문제와 해설이 다른 파일로 오면 읽어 낸 제목이 조금씩 달라서
   * 제목까지 맞춰 묶으면 같은 시험이 둘로 갈린다. 같은 해 같은 차수의 시험은 하나다.
   */
  const keyOf = (item: { univId: string; year: number; session: string | null }) =>
    `${item.univId}|${item.year}|${item.session ?? ""}`;

  const byKey = new Map<string, string>();
  const touchedUnivs = new Set(parsed.data.items.map((item) => item.univId));
  for (const univId of touchedUnivs) {
    for (const exam of await listExams(univId)) {
      byKey.set(keyOf({ univId, year: exam.year, session: exam.session ?? null }), exam.id);
    }
  }

  const touched = new Set<string>();
  const warnings: string[] = [];
  /** 이번에 이미 채운 자리 — 한 시험의 문제지는 하나라서 두 번 채워지면 안 된다. */
  const filled = new Map<string, { storagePath: string; pageFrom: number | null; pageTo: number | null }>();

  /**
   * 같은 시험의 같은 자리에 자료가 또 오면 덮어쓰지 않는다.
   * 같은 파일이면 쪽 범위를 넓혀 하나로 합치고(한 문제지가 여러 덩어리로 잡힌 경우),
   * 다른 파일이면 앞엣것을 지키고 알린다 — 덮어쓰면 앞 내용이 조용히 사라진다.
   */
  for (const item of parsed.data.items) {
    const slot = `${keyOf(item)}|${item.kind}`;
    const already = filled.get(slot);
    const label = item.kind === "question" ? "문제지" : "해설";
    const where = `${known.get(item.univId)!.name} ${item.year}${item.session ? ` ${item.session}` : ""}`;

    if (already) {
      if (already.storagePath === item.storagePath) {
        const merged = {
          storagePath: already.storagePath,
          pageFrom:
            already.pageFrom === null || item.pageFrom === null
              ? null
              : Math.min(already.pageFrom, item.pageFrom),
          pageTo:
            already.pageTo === null || item.pageTo === null
              ? null
              : Math.max(already.pageTo, item.pageTo),
        };
        filled.set(slot, merged);
        item.pageFrom = merged.pageFrom;
        item.pageTo = merged.pageTo;
        warnings.push(
          `${where} ${label}: 같은 파일에서 나뉘어 온 자료를 ${merged.pageFrom ?? "처음"}~${merged.pageTo ?? "끝"}쪽 하나로 합쳤습니다.`,
        );
      } else {
        warnings.push(
          `${where} ${label}: ${item.fileName} 을 넣지 않았습니다. ` +
            `한 시험에 ${label}는 하나라서 먼저 넣은 파일을 그대로 두었습니다. ` +
            `정말 다른 시험이면 차수(오전·오후 등)를 다르게 적어 다시 올려 주세요.`,
        );
        continue;
      }
    }
    filled.set(slot, {
      storagePath: item.storagePath,
      pageFrom: item.pageFrom,
      pageTo: item.pageTo,
    });

    const key = keyOf(item);
    let examId = byKey.get(key) ?? null;

    if (!examId) {
      const created = await exams(item.univId).add({
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

    const ref = examRef(item.univId, examId);
    const snap = await ref.get();
    if (!snap.exists) {
      warnings.push(`${item.fileName}: 기출을 찾지 못해 건너뛰었습니다.`);
      continue;
    }
    if (snap.data()?.[`${item.kind}Pdf`]) {
      warnings.push(`${where} ${label} 자리에 이미 있던 파일을 새 것으로 바꿨습니다.`);
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
      const document = await extractCached(
        item.storagePath,
        item.fileName,
        `${item.year} ${item.title}`,
      );
      const text = joinPages(document.pageTexts, item.pageFrom, item.pageTo);
      const from = Math.max(1, item.pageFrom ?? 1);
      const to = Math.min(document.pageTexts.length, item.pageTo ?? document.pageTexts.length);

      await extractionRef(item.univId, examId, item.kind).set({
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

    touched.add(`${item.univId}/${examId}`);
  }

  const exams_ = Object.fromEntries(
    await Promise.all([...touchedUnivs].map(async (id) => [id, await listExams(id)] as const)),
  );

  return Response.json({ created: touched.size, warnings, examsByUniv: exams_ });
}
