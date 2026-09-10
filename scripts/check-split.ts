/** CLOVA 가 한 번에 10쪽까지만 받아서 나눠 보내야 한다. npm run check:split */
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

import { splitPdf } from "@/lib/docs/crop";

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✔" : "✖"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

async function pageCount(data: Uint8Array): Promise<number> {
  return (await PDFDocument.load(data, { ignoreEncryption: true })).getPageCount();
}

async function main() {
  const long = new Uint8Array(readFileSync("/tmp/dummy/long-scan.pdf"));
  const total = await pageCount(long);
  console.log(`원본 ${total}쪽`);

  const chunks = await splitPdf(long, 10);
  const counts = await Promise.all(chunks.map(pageCount));
  check(
    `10쪽씩 ${Math.ceil(total / 10)}조각으로 나뉜다`,
    chunks.length === Math.ceil(total / 10),
    `${counts.join(" + ")} = ${counts.reduce((a, b) => a + b, 0)}쪽`,
  );
  check("쪽을 잃지 않는다", counts.reduce((a, b) => a + b, 0) === total);
  check("어느 조각도 10쪽을 넘지 않는다", counts.every((c) => c <= 10));

  // 짧은 문서는 그대로 둔다 — 괜히 다시 만들면 원본이 상한다
  const short = new Uint8Array(readFileSync("/tmp/dummy/scan.pdf"));
  const kept = await splitPdf(short, 10);
  check("10쪽 이하면 그대로 하나", kept.length === 1 && kept[0] === short);

  // 읽지 못하는 파일은 그대로 넘긴다
  const junk = new Uint8Array([1, 2, 3, 4]);
  const passed = await splitPdf(junk, 10);
  check("읽지 못하는 파일은 그대로 넘긴다", passed.length === 1 && passed[0] === junk);

  console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
  if (failed) process.exit(1);
}

main();
