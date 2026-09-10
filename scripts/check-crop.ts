/**
 * 쪽 잘라내기 확인. npm run check:crop
 * 한 파일에 문제지와 해설이 같이 든 경우, 학생에게는 문제지 쪽만 나가야 한다.
 */
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

async function crop(data: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  const source = await PDFDocument.load(data, { ignoreEncryption: true });
  const last = Math.min(source.getPageCount(), to);
  const cropped = await PDFDocument.create();
  const indices = Array.from({ length: last - from + 1 }, (_, i) => from - 1 + i);
  const pages = await cropped.copyPages(source, indices);
  for (const page of pages) cropped.addPage(page);
  return cropped.save();
}

async function pageCount(data: Uint8Array): Promise<number> {
  return (await PDFDocument.load(data, { ignoreEncryption: true })).getPageCount();
}

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`  ${ok ? "✔" : "✖"} ${label}${ok ? "" : ` — 받음 ${actual}, 기대 ${expected}`}`);
  if (!ok) failed += 1;
}

async function main() {
  // 1~3쪽 문제지, 4쪽 해설이 든 파일
  const original = new Uint8Array(readFileSync("/tmp/dummy/twoq.pdf"));
  check("원본은 4쪽", await pageCount(original), 4);

  const forStudent = await crop(original, 1, 3);
  check("학생에게는 3쪽만", await pageCount(forStudent), 3);

  const solution = await crop(original, 4, 4);
  check("해설은 1쪽", await pageCount(solution), 1);

  // 끝 쪽을 넘겨 잡아도 있는 만큼만
  check("범위가 넘치면 있는 만큼만", await pageCount(await crop(original, 3, 99)), 2);

  console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
  if (failed) process.exit(1);
}

main();
