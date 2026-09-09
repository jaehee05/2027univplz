/**
 * pdfjs 가 브라우저 전역 없이도 뜨는지 확인한다.
 * Vercel 에서는 pdfjs 자체 폴리필이 건너뛰어져 DOMMatrix 없이 적재된다.
 *   npm run check:pdfjs
 */
import { readFileSync } from "node:fs";

import { installPdfjsGlobals } from "../src/lib/docs/pdfjs-globals";

async function main() {
  for (const g of ["DOMMatrix", "Path2D", "ImageData", "OffscreenCanvas"]) {
    if (g in globalThis) {
      console.log(`  · ${g} 은 이미 있음 (이 환경에서는 검사 의미 없음)`);
    }
  }

  installPdfjsGlobals();
  console.log(
    `  ✔ 전역 채움: ${["DOMMatrix", "Path2D", "ImageData", "OffscreenCanvas"]
      .map((g) => `${g}=${typeof (globalThis as Record<string, unknown>)[g]}`)
      .join(" ")}`,
  );

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  console.log(`  ✔ pdfjs 적재됨 (v${pdfjs.version})`);

  const file = process.argv[2] ?? "/tmp/dummy/exam.pdf";
  const data = new Uint8Array(readFileSync(file));
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const chars = content.items.reduce(
    (sum, item) => sum + ("str" in item ? item.str.length : 0),
    0,
  );
  await doc.destroy();

  const ok = chars > 100;
  console.log(`  ${ok ? "✔" : "✖"} ${file} 1쪽에서 ${chars}자 읽음`);
  if (!ok) process.exit(1);
  console.log("\n전부 통과");
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
