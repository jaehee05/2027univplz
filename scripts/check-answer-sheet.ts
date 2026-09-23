import { readFile, writeFile } from "node:fs/promises";

import { fillPdf } from "@/lib/answer-sheet/export";
import { SUNGSHIN, capacityOf, fillGrid } from "@/lib/answer-sheet/sheet";

/**
 * 성신여대 답안지에 글자를 채워 PDF 로 떨군다. 눈으로 칸 맞춤을 확인할 때 쓴다.
 *   npm run check:sheet -- out.pdf
 */
const TEXT = [
  "제시문 (가)는 개인의 자유를 사회 질서보다 앞세운다. 이는 국가의 개입을 최소화할 때 비로소 개인이 자기 삶의 주인이 된다는 판단에 근거한다. 1948년 이후 0.5와 3.75, ABC를 쓴다.\n반면 (나)는 공동체가 합의한 규범이 개인의 선택에 앞선다고 본다.",
  "둘째 문항 답안입니다. " + "가나다라마바사아자차카타파하".repeat(80),
];

async function main() {
  const out = process.argv[2] ?? "answer-sheet.pdf";
  const glyphs = SUNGSHIN.grids.flatMap((grid, i) => {
    const filled = fillGrid(grid, TEXT[i], false);
    console.log(
      `${grid.number}번 ${filled.count}칸 / ${capacityOf(grid)}칸, 넘침 ${filled.overflow}칸`,
    );
    return filled.glyphs;
  });
  const bytes = await fillPdf(
    await readFile(`public${SUNGSHIN.pdf}`),
    await readFile("public/fonts/Victory-Medium.ttf"),
    glyphs,
  );
  await writeFile(out, bytes);
  console.log(
    `${out} — ${(bytes.length / 1024).toFixed(0)}KB, 글자 ${glyphs.length}개`,
  );
}

void main();
