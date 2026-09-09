import "server-only";

import { lookup } from "node:dns/promises";

import { serverEnv } from "@/lib/env";

/**
 * 네이버 클라우드 CLOVA OCR (General, V2).
 * 한국어 스캔본은 범용 비전 모델보다 이쪽이 정확하고 빠르다.
 *
 * 쓰려면 NCP 콘솔에서 OCR 도메인을 만들고 **API Gateway 연동**까지 한 뒤 두 값을 넣는다.
 *   CLOVA_OCR_INVOKE_URL  APIGW Invoke URL — `https://<id>.apigw.ntruss.com/custom/v1/...`
 *   CLOVA_OCR_SECRET      Secret Key
 * 없거나 실패하면 이 경로는 건너뛰고 Claude 로 넘어간다.
 *
 * 주의: `clovaocr-api-kr.ncloud.com` 으로 시작하는 주소는 NCP 안에서만 닿는 내부 전용이라
 * (사설 IP 10.x 로 풀린다) 바깥에서 부르면 연결이 되지 않는다. APIGW 주소를 써야 한다.
 */

/** OCR 응답을 기다리는 한도. 닿지 않는 주소에서 오래 붙잡히지 않게 한다. */
const TIMEOUT_MS = 60_000;

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

function isPrivateAddress(address: string): boolean {
  return (
    /^10\./.test(address) ||
    /^127\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
    address === "::1" ||
    address.startsWith("fd") ||
    address.startsWith("fe80:")
  );
}

/**
 * 부르기 전에 주소가 바깥에서 닿는 곳인지 본다.
 * 내부 전용 주소면 TCP 타임아웃까지 1분 넘게 붙잡히므로 미리 걸러 낸다.
 */
async function checkEndpoint(invokeUrl: string): Promise<void> {
  let host: string;
  try {
    host = new URL(invokeUrl).hostname;
  } catch {
    throw new Error(`CLOVA_OCR_INVOKE_URL 이 주소 형식이 아닙니다: ${invokeUrl.slice(0, 60)}`);
  }

  try {
    const { address } = await lookup(host);
    if (isPrivateAddress(address)) {
      throw new Error(
        `${host} 은 NCP 내부에서만 닿는 주소입니다(${address}). ` +
          "NCP 콘솔에서 CLOVA OCR 도메인의 API Gateway 연동을 켜고, " +
          "`https://<id>.apigw.ntruss.com/custom/v1/...` 형태의 Invoke URL 을 넣어 주세요.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("apigw.ntruss.com")) throw error;
    throw new Error(`${host} 주소를 찾지 못했습니다.`);
  }
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

  await checkEndpoint(invokeUrl);

  const response = await fetch(invokeUrl, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
