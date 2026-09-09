/** HWPX 글자 추출 확인. npm run check:hwpx */
import { writeFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";

import { extractHwpx } from "../src/lib/docs/hwpx";

function paragraph(text: string, pageBreak = false): string {
  return (
    `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="${pageBreak ? "1" : "0"}" columnBreak="0">` +
    `<hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p>`
  );
}

function section(paragraphs: string[]): Uint8Array {
  return strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ` +
      `xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
      paragraphs.join("") +
      `</hs:sec>`,
  );
}

/** 실제 hwpx 처럼 부수 파일까지 넣어 둔다 — 본문만 골라 읽는지 본다. */
function makeHwpx(sections: Uint8Array[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8("application/hwp+zip"),
    "META-INF/manifest.xml": strToU8("<manifest/>"),
    "Contents/header.xml": strToU8("<head/>"),
    "Preview/PrvText.txt": strToU8("미리보기 글자 — 본문이 아님"),
  };
  sections.forEach((data, index) => {
    files[`Contents/section${index}.xml`] = data;
  });
  return zipSync(files);
}

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `  ${ok ? "✔" : "✖"} ${label}${ok ? "" : `\n      받음 ${JSON.stringify(actual)}\n      기대 ${JSON.stringify(expected)}`}`,
  );
  if (!ok) failed += 1;
}

console.log("=== 1. 쪽 나눔 표시가 있는 문서 ===");
const withBreaks = extractHwpx(
  makeHwpx([
    section([
      paragraph("2027학년도 모의 논술고사 (인문계열)"),
      paragraph("제시문 (가) 근대 사회의 공론장은 이성적 토론의 공간이었다."),
      paragraph("[문제 1] 제시문을 활용해 논술하시오. (600자 내외)", true),
      paragraph("[문제 2] 통계를 해석하시오. (800자 내외)"),
    ]),
  ]),
);
check("쪽 나눔 표시를 찾는다", withBreaks.hadPageBreaks, true);
check("2쪽으로 나뉜다", withBreaks.pageTexts.length, 2);
check("1쪽 끝 문단", withBreaks.pageTexts[0].endsWith("공간이었다."), true);
check("2쪽 시작 문단", withBreaks.pageTexts[1].startsWith("[문제 1]"), true);
check(
  "미리보기 글자는 안 섞인다",
  withBreaks.pageTexts.join("").includes("미리보기"),
  false,
);

console.log("=== 2. 구역이 여럿인 문서 ===");
const multi = extractHwpx(
  makeHwpx([section([paragraph("인문계열 문제")]), section([paragraph("인문계열 해설")])]),
);
check("구역마다 쪽이 나뉜다", multi.pageTexts, ["인문계열 문제", "인문계열 해설"]);

console.log("=== 3. 특수문자 · 엔티티 ===");
const entities = extractHwpx(
  makeHwpx([section([paragraph("&lt;보기&gt; &amp; &quot;인용&quot; &#48124;&#51452;")])]),
);
check("엔티티를 되돌린다", entities.pageTexts[0], '<보기> & "인용" 민주');

console.log("=== 4. 쪽 나눔 표시가 없는 긴 문서 ===");
const paragraphs = Array.from({ length: 20 }, (_, i) => "가".repeat(300) + i);
const long = extractHwpx(makeHwpx([section(paragraphs.map((text) => paragraph(text)))]));
check("분량으로 여러 쪽이 된다", long.pageTexts.length > 1, true);
check("쪽 나눔 표시는 없다고 알린다", long.hadPageBreaks, false);
check(
  "글자를 잃지 않는다",
  long.pageTexts.join("").replace(/\n/g, "").length,
  paragraphs.join("").length,
);

// 뒤에서 실제 업로드로도 확인할 수 있게 파일로 남긴다.
writeFileSync(
  "/tmp/dummy/exam.hwpx",
  makeHwpx([
    section([
      paragraph("2027학년도 단국대학교 모의 논술고사 (인문계열)"),
      paragraph("제시문 (가) 근대 사회의 공론장은 사적 개인들이 모여 공적 사안을 토론하는 공간이었다."),
      paragraph("제시문 (나) 알고리즘은 이용자의 기존 신념을 강화하는 정보를 우선 제시한다."),
      paragraph(
        "[문제 1] 제시문 (가)와 (나)를 활용하여 공론장의 성격 변화를 설명하고, 그 변화가 민주주의에 미치는 영향을 논술하시오. (600자 내외, 30점)",
      ),
      paragraph("[문제 1] 채점 기준 (30점)", true),
      paragraph("제시문 (가)의 공론장 개념 파악 — 10점 / (나)와의 연결 — 12점 / 어법 — 8점"),
      paragraph("모범답안: 근대 공론장은 논거의 설득력이 의견의 우열을 가르는 공간이었다."),
    ]),
  ]),
);
console.log("\n/tmp/dummy/exam.hwpx 로 저장했습니다 (업로드 확인용).");

console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
if (failed) process.exit(1);
