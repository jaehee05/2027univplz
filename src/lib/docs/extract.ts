import "server-only";

import { adminBucket } from "@/lib/firebase/admin";
import { extractHwpx } from "@/lib/docs/hwpx";
import { installPdfjsGlobals } from "@/lib/docs/pdfjs-globals";
import { countPdfPages } from "@/lib/docs/page-count";
import { CLOVA_MAX_PAGES, isClovaConfigured, ocrWithClova } from "@/lib/docs/clova";
import { splitPdf } from "@/lib/docs/crop";
import type { ExtractionMethod } from "@/lib/types/exam";

/** 올릴 수 있는 파일 형식. zip 은 브라우저에서 풀어 이 둘만 올라온다. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".hwpx"] as const;

export function isSupportedDocument(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isHwpx(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".hwpx");
}

/** 이 값보다 페이지당 글자가 적으면 스캔본으로 보고 Claude 에 넘긴다. */
const CHARS_PER_PAGE_THRESHOLD = 60;

export interface ExtractedDocument {
  method: ExtractionMethod;
  /** 쪽별 글자. 1쪽이 index 0. */
  pageTexts: string[];
  /** 어느 길로 갔는지, 왜 그랬는지 */
  note: string;
}

/** pdfjs 로 텍스트 레이어를 쪽별로 읽는다. 스캔본이면 거의 빈 문자열이 나온다. */
async function readWithPdfjs(data: Uint8Array): Promise<string[]> {
  installPdfjsGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs 는 넘겨받은 버퍼를 가져가 버린다(detach). 스캔본이면 그 뒤에 OCR·Claude 로
  // 같은 파일을 다시 보내야 하므로 사본을 넘긴다.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true })
    .promise;

  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);

    pages.push(lines.join("\n").trim());
    page.cleanup();
  }

  await doc.destroy();
  return pages;
}

/**
 * PDF 에서 글자를 뽑는다.
 *
 * CLOVA OCR 을 먼저 쓴다. 텍스트 PDF 든 스캔본이든 한 번에 처리하고 한국어 정확도가 좋다.
 * CLOVA 가 없거나 실패하면 pdfjs 로 내려가는데, pdfjs 는 텍스트 레이어가 있는 PDF 만 읽는다.
 * 스캔본인데 CLOVA 를 쓸 수 없으면 글자를 뽑을 방법이 없으므로 그대로 실패시킨다 —
 * 빈 글로 넘어가면 뒤에서 엉뚱한 문항이 만들어진다.
 */
async function extractPdf(data: Uint8Array, label: string): Promise<ExtractedDocument> {
  let clovaError: string | null = null;

  if (isClovaConfigured()) {
    try {
      // CLOVA 는 한 번에 10쪽까지만 받는다. 더 길면 나눠 보내고 이어 붙인다.
      const chunks = await splitPdf(data, CLOVA_MAX_PAGES);

      const pages: string[] = [];
      for (const [index, chunk] of chunks.entries()) {
        // 뒷부분이 잘려 와도 모르고 넘어가지 않도록 조각의 쪽 수를 미리 센다.
        // 세지 못하면 0 이고, 그때는 검사를 건너뛴다.
        const expected = countPdfPages(chunk) || undefined;
        const name = chunks.length > 1 ? `${label} (${index + 1}/${chunks.length})` : label;
        pages.push(...(await ocrWithClova(chunk, name, expected)));
      }

      const total = pages.join("").length;
      if (total > 0) {
        const blank = pages.filter((page) => page.length === 0).length;
        return {
          method: "clova",
          pageTexts: pages,
          note:
            `CLOVA OCR 로 읽었습니다 (${pages.length}쪽 · ${total}자` +
            `${chunks.length > 1 ? ` · ${chunks.length}번에 나눠 보냄` : ""}` +
            `${blank > 0 ? ` · 글자 없는 쪽 ${blank}개` : ""}).`,
        };
      }
      clovaError = "글자를 한 자도 찾지 못했습니다";
    } catch (error) {
      clovaError = error instanceof Error ? error.message : String(error);
    }
  }

  let pageTexts: string[] = [];
  let pdfjsError: string | null = null;

  try {
    pageTexts = await readWithPdfjs(data);
  } catch (error) {
    pdfjsError = error instanceof Error ? error.message : String(error);
  }

  const chars = pageTexts.join("").length;
  const perPage = pageTexts.length > 0 ? chars / pageTexts.length : 0;
  const looksLikeScan = chars === 0 || perPage < CHARS_PER_PAGE_THRESHOLD;

  const clovaNote = clovaError
    ? `CLOVA OCR 실패(${clovaError}) — `
    : "CLOVA OCR 설정이 없어 — ";

  if (!looksLikeScan) {
    return {
      method: "pdfjs",
      pageTexts,
      note: `${clovaNote}텍스트 레이어에서 바로 읽었습니다 (쪽당 약 ${Math.round(perPage)}자).`,
    };
  }

  // 여기까지 왔다는 것은 스캔본인데 CLOVA 를 쓰지 못했다는 뜻이다.
  const reason = pdfjsError
    ? `pdfjs 로도 읽지 못했습니다(${pdfjsError})`
    : `텍스트 레이어가 쪽당 ${Math.round(perPage)}자뿐이라 스캔본입니다`;

  throw new Error(
    `${clovaNote}${reason}. 스캔본은 CLOVA OCR 로만 읽습니다 — ` +
      "CLOVA_OCR_INVOKE_URL · CLOVA_OCR_SECRET 을 확인해 주세요.",
  );
}

/** HWPX 는 OWPML(XML)이라 글자가 그대로 들어 있다. 스캔본이라는 것이 없다. */
function extractHwpxDocument(data: Uint8Array): ExtractedDocument {
  const result = extractHwpx(data);
  const chars = result.pageTexts.join("").length;

  return {
    method: "hwpx",
    pageTexts: result.pageTexts,
    note: result.hadPageBreaks
      ? `한글 문서에서 바로 읽었습니다 (문단 ${result.paragraphs}개 · 쪽 나눔 표시 기준 ${result.pageTexts.length}쪽 · ${chars}자).`
      : `한글 문서에서 바로 읽었습니다 (문단 ${result.paragraphs}개 · ${chars}자). ` +
        `쪽 나눔 표시가 없어 분량으로 ${result.pageTexts.length}쪽으로 나눴습니다 — 쪽 범위는 대략적입니다.`,
  };
}

/** 파일 형식에 맞는 방법으로 글자를 뽑는다. */
export async function extractDocument(
  data: Uint8Array,
  fileName: string,
  label: string,
): Promise<ExtractedDocument> {
  if (isHwpx(fileName)) return extractHwpxDocument(data);
  return extractPdf(data, label);
}

/**
 * 같은 파일을 여러 번(분류할 때 · 문제로 붙일 때 · 해설로 붙일 때) 읽게 되므로
 * 추출 결과를 Storage 에 캐시해 둔다. 스캔본은 Claude 를 다시 부르면 돈이 든다.
 */
function cachePath(storagePath: string): string {
  return `${storagePath}.pages.json`;
}

export async function extractCached(
  storagePath: string,
  fileName: string,
  label: string,
): Promise<ExtractedDocument> {
  const bucket = adminBucket();
  const cache = bucket.file(cachePath(storagePath));

  const [hit] = await cache.exists();
  if (hit) {
    try {
      const [buffer] = await cache.download();
      return JSON.parse(buffer.toString("utf8")) as ExtractedDocument;
    } catch {
      // 캐시가 깨졌으면 무시하고 다시 뽑는다.
    }
  }

  const [buffer] = await bucket.file(storagePath).download();
  const result = await extractDocument(new Uint8Array(buffer), fileName, label);

  await cache
    .save(JSON.stringify(result), { contentType: "application/json" })
    .catch(() => undefined);

  return result;
}

/** 쪽 범위(1부터, 양끝 포함)를 잘라 하나의 글로 만든다. */
export function joinPages(pageTexts: string[], from?: number | null, to?: number | null): string {
  const start = Math.max(1, from ?? 1) - 1;
  const end = Math.min(pageTexts.length, to ?? pageTexts.length);
  return pageTexts.slice(start, end).join("\n\n").trim();
}

/**
 * 분류용 요약 — 쪽마다 앞부분만 남긴다.
 * 전문을 다 넣으면 비싸고, 어디서 인문/자연 · 문제/해설이 갈리는지 판단하는 데는 앞부분이면 충분하다.
 */
export function pageDigest(pageTexts: string[], perPage = 350): string {
  return pageTexts
    .map((text, index) => {
      const head = text.replace(/\s+/g, " ").trim().slice(0, perPage);
      return `[${index + 1}쪽 · ${text.length}자] ${head || "(글자 없음)"}`;
    })
    .join("\n");
}
