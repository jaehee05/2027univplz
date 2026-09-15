import "server-only";

import { createHash } from "node:crypto";

import { PDFDocument, rgb, type PDFPage } from "pdf-lib";

import { adminBucket } from "@/lib/firebase/admin";
import type { PdfMask } from "@/lib/types/exam";

/**
 * 한 PDF 안에 문제지와 해설이 같이 들어 있는 경우가 많다.
 * 학생에게 문제지를 보여 줄 때 파일을 통째로 내보내면 뒤로 넘겨 답을 볼 수 있으므로,
 * 배정된 쪽만 잘라서 내보낸다.
 *
 * 그런데 **한 쪽 안에** 문제와 해설이 같이 있으면 쪽을 잘라도 소용이 없다.
 * 그때는 선생님이 지정해 둔 자리를 흰색으로 덮어서 내보낸다 (`masks`).
 *
 * ⚠ 이 덮기는 **눈에만** 걸린다. 덮인 자리의 글자는 파일 안에 그대로 남아 있어,
 * 긁어 붙이거나 글자 추출기를 돌리면 읽힌다. 눈으로 넘겨보다 답이 보이는 것은 막지만,
 * 작정하고 파내려는 학생은 막지 못한다. 그것까지 막으려면 그 쪽을 그림으로 구워야 하고,
 * 그러자면 서버에 PDF 를 그림으로 바꾸는 장치가 따로 있어야 한다.
 *
 * 자를 때마다 다시 만들지 않도록 결과를 Storage 에 캐시한다.
 */
function cachePath(
  storagePath: string,
  from: number,
  to: number,
  masks: PdfMask[],
): string {
  if (masks.length === 0) return `${storagePath}.p${from}-${to}.pdf`;
  // 가림칠을 고치면 캐시가 달라져야 한다 — 내용으로 이름을 짓는다.
  const digest = createHash("sha1")
    .update(JSON.stringify(masks.map((m) => [m.page, m.x, m.y, m.w, m.h])))
    .digest("hex")
    .slice(0, 12);
  return `${storagePath}.p${from}-${to}.m${digest}.pdf`;
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

/**
 * 화면에서 잰 비율 좌표(왼쪽 위 원점)를 PDF 좌표(왼쪽 **아래** 원점)로 옮겨 덮는다.
 *
 * 쪽에 회전(`/Rotate`)이 걸려 있으면 보이는 모양과 속 좌표계가 어긋난다.
 * 선생님은 **보이는 그대로** 칠했으므로, 그 회전을 되돌려 자리를 잡는다.
 */
function paintMask(page: PDFPage, mask: PdfMask): void {
  const box = page.getMediaBox();
  const width = box.width;
  const height = box.height;
  const angle = ((page.getRotation().angle % 360) + 360) % 360;

  // 보이는 쪽의 크기 — 90·270 도면 가로세로가 뒤바뀐다.
  const turned = angle === 90 || angle === 270;
  const viewW = turned ? height : width;
  const viewH = turned ? width : height;

  // 보이는 화면에서의 자리 (왼쪽 위 원점, 포인트 단위)
  const vx = mask.x * viewW;
  const vy = mask.y * viewH;
  const vw = mask.w * viewW;
  const vh = mask.h * viewH;

  let rect: { x: number; y: number; width: number; height: number };
  switch (angle) {
    case 90:
      rect = { x: vy, y: vx, width: vh, height: vw };
      break;
    case 180:
      rect = { x: width - vx - vw, y: vy, width: vw, height: vh };
      break;
    case 270:
      rect = { x: width - vy - vh, y: height - vx - vw, width: vh, height: vw };
      break;
    default:
      rect = { x: vx, y: height - vy - vh, width: vw, height: vh };
  }

  page.drawRectangle({
    x: box.x + rect.x,
    y: box.y + rect.y,
    width: rect.width,
    height: rect.height,
    color: rgb(1, 1, 1),
    // 테두리를 빼지 않으면 얇은 검은 선이 남는다.
    borderWidth: 0,
  });
}

export async function cropPdfPages(
  storagePath: string,
  pageFrom: number | null,
  pageTo: number | null,
  masks: PdfMask[] = [],
): Promise<Uint8Array> {
  const bucket = adminBucket();

  // 자를 것도 덮을 것도 없으면 원본 그대로다.
  if (!pageFrom && !pageTo && masks.length === 0) {
    const [buffer] = await bucket.file(storagePath).download();
    return new Uint8Array(buffer);
  }

  const from = Math.max(1, pageFrom ?? 1);
  const cache = bucket.file(cachePath(storagePath, from, pageTo ?? 0, masks));

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

  // 가림칠은 **원본 쪽 번호**로 적혀 있다. 잘라 낸 뒤의 자리로 옮겨 칠한다.
  for (const mask of masks) {
    const at = mask.page - from;
    const page = cropped.getPages()[at];
    if (page) paintMask(page, mask);
  }

  const bytes = await cropped.save();

  await cache
    .save(Buffer.from(bytes), { contentType: "application/pdf" })
    .catch(() => undefined);

  return bytes;
}
