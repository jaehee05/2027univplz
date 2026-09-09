import "server-only";

import { anthropic } from "@/lib/anthropic/client";
import { adminBucket } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { extractHwpx } from "@/lib/docs/hwpx";
import { installPdfjsGlobals } from "@/lib/docs/pdfjs-globals";
import { countPdfPages } from "@/lib/docs/page-count";
import { isClovaConfigured, ocrWithClova } from "@/lib/docs/clova";
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

/** Claude document 블록 제한 (100페이지 / 32MB) 안쪽으로만 보낸다. */
const CLAUDE_MAX_PAGES = 100;
const CLAUDE_MAX_BYTES = 30 * 1024 * 1024;

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

/** 쪽 경계 표시를 넣어 옮겨 적게 하고, 그 표시로 다시 쪼갠다. */
const PAGE_MARK = /\[\[\s*(?:page|쪽)\s*\d+\s*\]\]/gi;

async function readWithClaude(data: Uint8Array, hint: string): Promise<string[]> {
  if (data.byteLength > CLAUDE_MAX_BYTES) {
    throw new Error(
      `PDF 가 ${Math.round(data.byteLength / 1024 / 1024)}MB 로 너무 큽니다. 30MB 이하로 나눠 올려 주세요.`,
    );
  }

  const base64 = Buffer.from(data).toString("base64");

  const stream = anthropic().messages.stream({
    model: serverEnv.extractionModel,
    max_tokens: 32000,
    system:
      "너는 한국 대학 논술 시험지를 글자로 옮기는 사람이다. " +
      "보이는 내용을 빠짐없이, 원래 순서와 줄바꿈을 지켜 그대로 옮겨 적어라. " +
      "요약하거나 해설을 덧붙이지 말고, 표는 줄글로 풀어서 적는다. " +
      "제시문 기호(가·나·다, [가], (A) 등)와 문항 번호는 반드시 그대로 남긴다. " +
      "각 쪽이 시작될 때마다 그 줄에 [[page 1]], [[page 2]] 처럼 쪽 번호만 적은 줄을 넣어라.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
            title: hint,
          },
          { type: "text", text: "이 PDF 의 모든 글자를 쪽 표시와 함께 그대로 옮겨 적어 줘." },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parts = text.split(PAGE_MARK).map((part) => part.trim());
  // 첫 조각은 [[page 1]] 앞의 빈 부분이라 비어 있으면 버린다.
  if (parts.length > 1 && !parts[0]) parts.shift();
  return parts.length ? parts : [text.trim()];
}

/**
 * PDF 를 쪽별 텍스트로 만든다.
 * 텍스트 레이어가 있으면 그대로 쓰고, 거의 없으면 Claude 로 넘긴다.
 */
/**
 * PDF 에서 글자를 뽑는다.
 *
 * CLOVA OCR 이 설정돼 있으면 먼저 쓴다. 텍스트 PDF 든 스캔본이든 한 번에 처리하고
 * 한국어 정확도가 좋다. 서버리스에서 pdfjs 가 깨지는 일이 잦아 그쪽에 기대지 않는다.
 * CLOVA 가 없거나 실패하면 pdfjs → (글자가 거의 없으면) Claude 순으로 내려간다.
 */
async function extractPdf(data: Uint8Array, label: string): Promise<ExtractedDocument> {
  let clovaError: string | null = null;

  if (isClovaConfigured()) {
    try {
      // 뒷부분이 잘려 와도 모르고 넘어가지 않도록 원본 쪽 수를 미리 센다.
      // 세지 못하면 0 이고, 그때는 검사를 건너뛴다.
      const pages = await ocrWithClova(data, label, countPdfPages(data) || undefined);
      const total = pages.join("").length;
      if (total > 0) {
        const blank = pages.filter((page) => page.length === 0).length;
        return {
          method: "clova",
          pageTexts: pages,
          note:
            `CLOVA OCR 로 읽었습니다 (${pages.length}쪽 · ${total}자` +
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

  const clovaNote = clovaError ? `CLOVA OCR 실패(${clovaError}) — ` : "";

  if (!looksLikeScan) {
    return {
      method: "pdfjs",
      pageTexts,
      note: `${clovaNote}텍스트 레이어에서 바로 읽었습니다 (쪽당 약 ${Math.round(perPage)}자).`,
    };
  }

  if (pageTexts.length > CLAUDE_MAX_PAGES) {
    throw new Error(
      `스캔본이고 ${pageTexts.length}쪽이라 한 번에 처리할 수 없습니다. ${CLAUDE_MAX_PAGES}쪽 이하로 나눠 올려 주세요.`,
    );
  }

  const reason = pdfjsError
    ? `pdfjs 읽기 실패(${pdfjsError})`
    : `텍스트 레이어가 쪽당 ${Math.round(perPage)}자뿐`;

  return {
    method: "claude",
    pageTexts: await readWithClaude(data, label),
    note: `${clovaNote}${reason} — ${serverEnv.extractionModel} 로 글자를 옮겼습니다.`,
  };
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
