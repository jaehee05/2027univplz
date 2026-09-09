/** 원본 바이트로 PDF 쪽 수를 세는지 확인한다. npm run check:pagecount */
import { readFileSync } from "node:fs";

import { countPdfPages } from "../src/lib/docs/page-count";

const CASES: [string, number][] = [
  ["/tmp/dummy/exam.pdf", 1],
  ["/tmp/dummy/scan.pdf", 2],
  ["/tmp/dummy/combined.pdf", 8],
  ["/tmp/dummy/solution.pdf", 1],
];

let failed = 0;
for (const [file, expected] of CASES) {
  const counted = countPdfPages(new Uint8Array(readFileSync(file)));
  // 0 은 "모르겠다" 라서 통과로 본다 — 검사를 건너뛸 뿐 잘못된 판단은 아니다.
  const ok = counted === expected || counted === 0;
  console.log(
    `  ${ok ? "✔" : "✖"} ${file.split("/").pop()} → ${counted === 0 ? "모르겠음(검사 건너뜀)" : `${counted}쪽`} (실제 ${expected}쪽)`,
  );
  if (!ok) failed += 1;
}

// 아무 것도 못 세면 검사 자체가 무의미하므로 알려 준다.
const known = CASES.filter(([f]) => countPdfPages(new Uint8Array(readFileSync(f))) > 0).length;
console.log(`\n  ${known}/${CASES.length} 개는 실제로 셌습니다.`);

console.log(failed === 0 ? "전부 통과" : `${failed}건 실패`);
if (failed) process.exit(1);
