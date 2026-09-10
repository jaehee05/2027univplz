/**
 * 인쇄 결과가 종이 안에 들어오는지 잰다. npm run check:printfit
 * 앞서 npm run check:print 로 받아 둔 HTML 을 Chrome 으로 PDF 로 만든 뒤 돌린다.
 */
import { readFileSync } from "node:fs";

const mm = (pt: number) => Math.round((pt / 72) * 25.4 * 10) / 10;
/** @page 여백 — 이 안쪽에 글자가 들어와야 한다 */
const MARGIN = { portrait: 15, landscape: 10 };

async function main() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let failed = 0;

  for (const name of ["exam", "sheet", "answer", "correction"]) {
    const data = new Uint8Array(readFileSync(`/tmp/dummy/out-${name}.pdf`));
    const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
    console.log(`\n${name}`);

    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const [, , width, height] = page.view;
      const landscape = width > height;
      const margin = landscape ? MARGIN.landscape : MARGIN.portrait;
      const content = await page.getTextContent();

      let left = Infinity;
      let right = -Infinity;
      for (const item of content.items) {
        // 빈 조각은 폭이 실제 글자와 달라서 센다고 쳐도 뜻이 없다.
        if (!("str" in item) || !item.str.trim()) continue;
        left = Math.min(left, item.transform[4]);
        right = Math.max(right, item.transform[4] + (item.width ?? 0));
      }

      const rightEdge = mm(width) - margin;
      const ok = mm(left) >= margin - 1 && mm(right) <= rightEdge + 1;
      if (!ok) failed += 1;
      console.log(
        `  ${ok ? "✔" : "✖"} ${i}쪽 ${Math.round(mm(width))}×${Math.round(mm(height))}mm ${landscape ? "가로" : "세로"} · ` +
          `글자 ${mm(left)}~${mm(right)}mm (안쪽 ${margin}~${Math.round(rightEdge)}mm)`,
      );
      page.cleanup();
    }
    await doc.destroy();
  }

  console.log(failed === 0 ? "\n전부 종이 안에 들어옵니다" : `\n${failed}쪽이 종이를 넘습니다`);
  if (failed) process.exit(1);
}

main();
