/** zip 안에서 PDF 만 골라내는지 확인한다. npm run check:zip */
import { readFileSync } from "node:fs";
import { unzip, zipSync, strToU8 } from "fflate";

function isJunk(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return (
    path.startsWith("__MACOSX/") ||
    path.endsWith("/") ||
    base.startsWith("._") ||
    base === ".DS_Store" ||
    base === ""
  );
}

async function pdfsIn(buffer: Uint8Array): Promise<string[]> {
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buffer, (error, result) => (error ? reject(error) : resolve(result)));
  });
  return Object.entries(entries)
    .filter(([path]) => !isJunk(path) && path.toLowerCase().endsWith(".pdf"))
    .map(([path]) => path.split("/").pop() ?? path)
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
}

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "✔" : "✖"} ${label}${ok ? "" : `\n      받음 ${JSON.stringify(actual)}\n      기대 ${JSON.stringify(expected)}`}`);
  if (!ok) failed += 1;
}

async function main() {
  console.log("=== 1. 실제 zip (기출 3개) ===");
  const real = readFileSync("/tmp/dummy/batch.zip");
  check("PDF 3개를 꺼낸다", await pdfsIn(new Uint8Array(real)), [
    "combined.pdf",
    "exam.pdf",
    "solution.pdf",
  ]);

  console.log("=== 2. 폴더 · 맥 부스러기 · 다른 확장자 ===");
  const messy = zipSync({
    "2026/문제.pdf": strToU8("a"),
    "2026/해설.PDF": strToU8("b"),
    "2026/메모.txt": strToU8("c"),
    "__MACOSX/2026/._문제.pdf": strToU8("junk"),
    ".DS_Store": strToU8("junk"),
  });
  check("폴더 안 PDF 만, 대문자 확장자 포함", await pdfsIn(messy), ["문제.pdf", "해설.PDF"]);

  console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
  if (failed) process.exit(1);
}

main();
