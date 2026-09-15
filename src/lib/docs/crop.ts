import "server-only";

import { PDFDocument } from "pdf-lib";

import { adminBucket } from "@/lib/firebase/admin";

/**
 * 한 PDF 안에 문제지와 해설이 같이 들어 있는 경우가 많다.
 * 학생에게 문제지를 보여 줄 때 파일을 통째로 내보내면 뒤로 넘겨 답을 볼 수 있으므로,
 * 배정된 쪽만 잘라서 내보낸다.
 *
 * 자를 때마다 다시 만들지 않도록 결과를 Storage 에 캐시한다.
 */
function cachePath(storagePath: string, from: number, to: number): string {
  return `${storagePath}.p${from}-${to}.pdf`;
}

/**
 * PDF 를 쪽 수 단위로 잘라 여러 개로 나눈다.
 * CLOVA OCR 이 한 번에 10쪽까지만 받아서, 그보다 긴 문서는 나눠 보내야 한다.
 * 읽지 못하는 PDF 면 원본 하나만 돌려준다 — 부르는 쪽에서 그대로 시도하게 둔다.
 */
export async function splitPdf(data: Uint8Array, pagesPerChunk: number): Promise<Uint8Array[]> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(data, { ignoreEncryption: true });
  } catch {
    return [data];
  }

  const total = source.getPageCount();
  if (total <= pagesPerChunk) return [data];

  const chunks: Uint8Array[] = [];
  for (let from = 0; from < total; from += pagesPerChunk) {
    const part = await PDFDocument.create();
    const indices = Array.from(
      { length: Math.min(pagesPerChunk, total - from) },
      (_, i) => from + i,
    );
    const pages = await part.copyPages(source, indices);
    for (const page of pages) part.addPage(page);
    chunks.push(await part.save());
  }
  return chunks;
}

export async function cropPdfPages(
  storagePath: string,
  pageFrom: number | null,
  pageTo: number | null,
): Promise<Uint8Array> {
  const bucket = adminBucket();

  // 범위가 없으면 원본 그대로다.
  if (!pageFrom && !pageTo) {
    const [buffer] = await bucket.file(storagePath).download();
    return new Uint8Array(buffer);
  }

  const from = Math.max(1, pageFrom ?? 1);
  const cache = bucket.file(cachePath(storagePath, from, pageTo ?? 0));

  const [hit] = await cache.exists();
  if (hit) {
    const [buffer] = await cache.download();
    return new Uint8Array(buffer);
  }

  const [buffer] = await bucket.file(storagePath).download();
  const source = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });

  const last = Math.min(source.getPageCount(), pageTo ?? source.getPageCount());
  if (from > last) {
    throw new Error(`쪽 범위가 잘못되었습니다 (${from}~${last}).`);
  }

  const cropped = await PDFDocument.create();
  const indices = Array.from({ length: last - from + 1 }, (_, i) => from - 1 + i);
  const pages = await cropped.copyPages(source, indices);
  for (const page of pages) cropped.addPage(page);

  const bytes = await cropped.save();

  await cache
    .save(Buffer.from(bytes), { contentType: "application/pdf" })
    .catch(() => undefined);

  return bytes;
}
