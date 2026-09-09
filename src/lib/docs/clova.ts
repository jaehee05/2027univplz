import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * 네이버 클라우드 CLOVA OCR (General, V2).
 * 한국어 스캔본은 범용 비전 모델보다 이쪽이 정확하고 빠르다.
 *
 * 쓰려면 NCP 콘솔에서 OCR 도메인을 만들고 두 값을 환경변수에 넣는다.
 *   CLOVA_OCR_INVOKE_URL  APIGW Invoke URL
 *   CLOVA_OCR_SECRET      Secret Key
 * 없으면 이 경로는 건너뛰고 Claude 로 넘어간다.
 */

interface ClovaField {
  inferText?: string;
  /** 이 글자 뒤에서 줄이 바뀌는지 */
  lineBreak?: boolean;
}

interface ClovaImage {
  inferResult?: string;
  message?: string;
  fields?: ClovaField[];
}

interface ClovaResponse {
  images?: ClovaImage[];
}

export function isClovaConfigured(): boolean {
  return Boolean(serverEnv.clovaOcrInvokeUrl && serverEnv.clovaOcrSecret);
}

/** 한 장(이미지 하나)의 글자를 줄바꿈을 살려 잇는다. */
function joinFields(fields: ClovaField[]): string {
  let line = "";
  const lines: string[] = [];

  for (const field of fields) {
    const text = field.inferText ?? "";
    line += line ? ` ${text}` : text;
    if (field.lineBreak) {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);

  return lines.join("\n").trim();
}

/**
 * PDF 를 통째로 넘겨 쪽별 글자를 받는다.
 * 응답의 images 한 개가 한 쪽이다.
 */
export async function ocrWithClova(data: Uint8Array, fileName: string): Promise<string[]> {
  const invokeUrl = serverEnv.clovaOcrInvokeUrl;
  const secret = serverEnv.clovaOcrSecret;
  if (!invokeUrl || !secret) {
    throw new Error("CLOVA OCR 설정이 없습니다.");
  }

  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OCR-SECRET": secret },
    body: JSON.stringify({
      version: "V2",
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      // 표가 많은 시험지에서 칸 구분을 살린다.
      enableTableDetection: true,
      images: [
        {
          format: "pdf",
          name: fileName.replace(/\.[^.]+$/, "").slice(0, 60) || "document",
          data: Buffer.from(data).toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CLOVA OCR ${response.status} — ${body.slice(0, 200)}`);
  }

  const result = (await response.json()) as ClovaResponse;
  const images = result.images ?? [];
  if (images.length === 0) {
    throw new Error("CLOVA OCR 이 빈 응답을 돌려줬습니다.");
  }

  const failed = images.find((image) => image.inferResult && image.inferResult !== "SUCCESS");
  if (failed) {
    throw new Error(`CLOVA OCR 실패 — ${failed.message ?? failed.inferResult}`);
  }

  return images.map((image) => joinFields(image.fields ?? []));
}
