import "server-only";

import { anthropic } from "@/lib/anthropic/client";
import { serverEnv } from "@/lib/env";
import type { Extraction } from "@/lib/types/exam";

/** 이 값보다 페이지당 글자가 적으면 스캔본으로 보고 Claude 에 넘긴다. */
const CHARS_PER_PAGE_THRESHOLD = 60;

/** Claude document 블록 제한 (100페이지 / 32MB) 안쪽으로만 보낸다. */
const CLAUDE_MAX_PAGES = 100;
const CLAUDE_MAX_BYTES = 30 * 1024 * 1024;

interface PdfjsResult {
  text: string;
  pages: number;
}

/**
 * pdfjs 로 텍스트 레이어를 읽는다. 스캔본이면 거의 빈 문자열이 나온다.
 * Node 에서는 워커 없이 동작하도록 legacy 빌드를 쓴다.
 */
async function extractWithPdfjs(data: Uint8Array): Promise<PdfjsResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // 글자만 뽑으므로 폰트는 아예 만들지 않는다.
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;

  const parts: string[] = [];
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

    parts.push(lines.join("\n").trim());
    page.cleanup();
  }

  const pages = doc.numPages;
  await doc.destroy();

  return { text: parts.join("\n\n").trim(), pages };
}

/** 스캔본을 Claude 에 그림째 넘겨 글자로 옮긴다. */
async function extractWithClaude(data: Uint8Array, hint: string): Promise<string> {
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
      "제시문 기호(가·나·다, [가], (A) 등)와 문항 번호는 반드시 그대로 남긴다.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
            title: hint,
          },
          { type: "text", text: "이 PDF 의 모든 글자를 그대로 옮겨 적어 줘." },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * PDF 한 개를 텍스트로 만든다. 텍스트 레이어가 있으면 그대로 쓰고,
 * 거의 없으면 Claude 로 넘긴 뒤 어느 길로 갔는지 함께 돌려준다.
 */
export async function extractPdfText(
  data: Uint8Array,
  label: string,
): Promise<Omit<Extraction, "extractedAt">> {
  let pages = 0;
  let pdfjsText = "";
  let pdfjsError: string | null = null;

  try {
    const result = await extractWithPdfjs(data);
    pages = result.pages;
    pdfjsText = result.text;
  } catch (error) {
    pdfjsError = error instanceof Error ? error.message : String(error);
  }

  const perPage = pages > 0 ? pdfjsText.length / pages : 0;
  const looksLikeScan = pdfjsText.length === 0 || perPage < CHARS_PER_PAGE_THRESHOLD;

  if (!looksLikeScan) {
    return {
      method: "pdfjs",
      pages,
      chars: pdfjsText.length,
      text: pdfjsText,
      note: `텍스트 레이어에서 바로 읽었습니다 (페이지당 약 ${Math.round(perPage)}자).`,
    };
  }

  if (pages > CLAUDE_MAX_PAGES) {
    throw new Error(
      `스캔본이고 ${pages}쪽이라 한 번에 처리할 수 없습니다. ${CLAUDE_MAX_PAGES}쪽 이하로 나눠 올려 주세요.`,
    );
  }

  const reason = pdfjsError
    ? `pdfjs 읽기 실패(${pdfjsError})`
    : `텍스트 레이어가 페이지당 ${Math.round(perPage)}자뿐`;

  const text = await extractWithClaude(data, label);

  return {
    method: "claude",
    pages,
    chars: text.length,
    text,
    note: `${reason} — 스캔본으로 보고 ${serverEnv.extractionModel} 로 글자를 옮겼습니다.`,
  };
}
