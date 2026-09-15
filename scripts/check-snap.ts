/**
 * 첨삭 구간이 말이 되는 자리에서 끊기는지 잰다. npm run check:snap
 * 외부 호출이 없어 요금이 들지 않는다.
 */
import { snapRange } from "../src/lib/work/snap";

let failed = 0;

/**
 * `|` 로 자를 자리를 표시한 글을 넣고, 붙여진 결과를 같은 표기로 확인한다.
 * 눈으로 읽히는 쪽이 어긋났을 때 무엇이 틀렸는지 바로 보인다.
 */
function check(name: string, marked: string, want: string) {
  const text = marked.replace(/\|/g, "");
  const first = marked.indexOf("|");
  const second = marked.indexOf("|", first + 1) - 1;

  const got = snapRange(text, first, second);
  const shown = text.slice(0, got.start) + "|" + text.slice(got.start, got.end) + "|" + text.slice(got.end);

  const ok = shown === want;
  if (!ok) failed += 1;
  console.log(`  ${ok ? "✔" : "✗"} ${name}`);
  if (!ok) {
    console.log(`      받은 것 ${shown}`);
    console.log(`      바란 것 ${want}`);
  }
}

console.log("구간을 말이 되는 자리로 옮겨 붙인다\n");

console.log("여는 괄호를 닫는다");
check(
  "`(가` 에서 끊긴 것",
  "집중과 분산은 나뉜다. |제시문 (가|)는 정치를 다룬다.",
  "집중과 분산은 나뉜다. |제시문 (가)는 정치를 다룬다.|",
);
check(
  "괄호 안에서 시작한 것",
  "제시문 (|가)는 정치를 다룬다.| 그러나",
  "제시문 |(가)는 정치를 다룬다.| 그러나",
);

console.log("\n문장부호까지 민다");
check(
  "낱말 한복판에서 끝난 것",
  "|집중과 분산은 어느 하나가| 옳은 원리가 아니다. 다음 문장.",
  "|집중과 분산은 어느 하나가 옳은 원리가 아니다.| 다음 문장.",
);
check(
  "문장이 멀면 절에서 끊는다",
  "|집중은| 힘을 모으는 일이고, 분산은 힘을 흩는 일이며, 둘은 언제나 함께 간다고 보아야 한다는 것이 이 글의 뜻이다.",
  "|집중은 힘을 모으는 일이고,| 분산은 힘을 흩는 일이며, 둘은 언제나 함께 간다고 보아야 한다는 것이 이 글의 뜻이다.",
);
check(
  "이미 문장이 끝나 있으면 그대로",
  "|집중과 분산은 나뉜다.| 그러나 제시문은",
  "|집중과 분산은 나뉜다.| 그러나 제시문은",
);
check(
  "닫는 따옴표까지 품는다",
  "그는 |'만인의 투쟁'이라고 했다|. 그러나",
  "그는 |'만인의 투쟁'이라고 했다.| 그러나",
);

console.log("\n앞끝을 어절 머리로 당긴다");
check(
  "낱말 한복판에서 시작한 것",
  "제시문에서 집|중과 분산은 나뉜다.| 그러나",
  "제시문에서 |집중과 분산은 나뉜다.| 그러나",
);
check(
  "이미 어절 머리면 그대로",
  "제시문에서 |집중과 분산은 나뉜다.| 그러나",
  "제시문에서 |집중과 분산은 나뉜다.| 그러나",
);

console.log("\n멀리 끌고 가지 않는다");
// 공백도 부호도 없이 길게 이어지면 당길 자리가 없다. 억지로 문장 머리까지 끌지 않는다.
check(
  "당길 자리가 너무 멀면 앞끝은 그대로 둔다",
  "가나다라마바사아자차카타파하가나다라마바사아자차카타파|하다.|",
  "가나다라마바사아자차카타파하가나다라마바사아자차카타파|하다.|",
);
check(
  "밀 자리가 너무 멀면 어절 끝에서 끊는다",
  "|집중은| 가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하다.",
  "|집중은| 가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하다.",
);

console.log("\n가장자리");
check("맨 앞에서 시작", "|집중과 분산.| 다음", "|집중과 분산.| 다음");
check("글 끝에서 끝남", "앞말 |집중과 분산|", "앞말 |집중과 분산|");
check("앞뒤 공백은 뺀다", "앞말| 집중과 분산. |다음", "앞말 |집중과 분산.| 다음");

// 어떤 값이 들어와도 답안 안에 머물고 뒤집히지 않아야 한다.
console.log("\n어떤 값이 와도 답안 안에 머무는가");
const sample = "집중과 분산은 어느 하나가 옳은 원리가 아니라 영역마다 다른 관계를 맺는다. (가)는 정치를 다룬다.";
let safe = true;
for (let a = -5; a <= sample.length + 5; a += 1) {
  for (let b = a; b <= sample.length + 5; b += 3) {
    const got = snapRange(sample, a, b);
    if (got.start < 0 || got.end > sample.length || got.end < got.start) {
      safe = false;
      console.log(`  ✗ (${a}, ${b}) → (${got.start}, ${got.end})`);
    }
  }
}
if (!safe) failed += 1;
console.log(`  ${safe ? "✔" : "✗"} 범위를 벗어나지 않는다`);

if (failed > 0) {
  console.log(`\n✗ ${failed}개 어긋남`);
  process.exit(1);
}
console.log("\n✔ 구간 끊기 이상 없음");
