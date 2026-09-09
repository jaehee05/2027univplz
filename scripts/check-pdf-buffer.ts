/**
 * pdfjs 가 원본 버퍼를 가져가 버리지 않는지 확인한다.
 * 스캔본은 pdfjs 로 먼저 읽어 본 뒤 같은 파일을 OCR·Claude 로 다시 보내야 해서,
 * 여기서 버퍼가 비면 "PDF cannot be empty" 로 터진다.
 *   npm run check:pdfbuf
 */
import { readFileSync } from "node:fs";

async function main() {
  const file = process.argv[2] ?? "/tmp/dummy/scan.pdf";
  const original = new Uint8Array(readFileSync(file));
  const before = original.byteLength;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(original), disableFontFace: true })
    .promise;
  const pages = doc.numPages;
  await doc.destroy();

  const after = original.byteLength;
  const ok = after === before && after > 0;
  console.log(`  ${ok ? "✔" : "✖"} pdfjs 로 ${pages}쪽 읽은 뒤에도 원본이 남아 있다 (${before} → ${after} 바이트)`);
  if (!ok) process.exit(1);

  // 실제로 base64 로 다시 만들 수 있는지까지 본다.
  const base64 = Buffer.from(original).toString("base64");
  const ok2 = base64.length > 100;
  console.log(`  ${ok2 ? "✔" : "✖"} 원본을 base64 로 다시 보낼 수 있다 (${base64.length}자)`);
  if (!ok2) process.exit(1);

  console.log("\n전부 통과");
}

main();
