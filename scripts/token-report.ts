/** 지금까지 쓴 토큰을 용도별로 모아 본다. npm run report:tokens */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

/** 100만 토큰당 달러 (입력 / 출력) */
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5": [1, 5],
};

interface Row {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function cost(row: Row): number {
  const [inPrice, outPrice] = PRICE[row.model] ?? [5, 25];
  return (row.inputTokens / 1e6) * inPrice + (row.outputTokens / 1e6) * outPrice;
}

function summarize(label: string, rows: Row[]) {
  if (rows.length === 0) {
    console.log(`\n${label}: 기록 없음`);
    return;
  }
  const input = rows.reduce((s, r) => s + r.inputTokens, 0);
  const output = rows.reduce((s, r) => s + r.outputTokens, 0);
  const total = rows.reduce((s, r) => s + cost(r), 0);
  const models = [...new Set(rows.map((r) => r.model))].join(", ");

  console.log(`\n${label}  ${rows.length}회 · ${models}`);
  console.log(`  입력 ${input.toLocaleString()} · 출력 ${output.toLocaleString()} 토큰`);
  console.log(
    `  합계 $${total.toFixed(3)} · 1회 평균 $${(total / rows.length).toFixed(3)}` +
      ` (입력 ${Math.round(input / rows.length).toLocaleString()} · 출력 ${Math.round(output / rows.length).toLocaleString()})`,
  );
}

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  const corrections: Row[] = (await db.collection("corrections").get()).docs
    .map((d) => d.data().usage)
    .filter(Boolean);

  const analyses: Row[] = [];
  const parses: Row[] = [];
  for (const univ of (await db.collection("universities").get()).docs) {
    for (const doc of (await univ.ref.collection("analyses").get()).docs) {
      if (doc.data().usage) analyses.push(doc.data().usage);
    }
    for (const doc of (await univ.ref.collection("exams").get()).docs) {
      if (doc.data().parseUsage) parses.push(doc.data().parseUsage);
    }
  }

  console.log("=== 기출 한 번 등록할 때 (한 번만 드는 값) ===");
  const classify = (await db.collection("meta").doc("usage").get()).data()?.classify;
  if (classify?.calls) {
    summarize("파일 분류 (파일 하나)", Array.from({ length: classify.calls }, () => ({
      model: classify.model,
      inputTokens: Math.round(classify.inputTokens / classify.calls),
      outputTokens: Math.round(classify.outputTokens / classify.calls),
    })));
  } else {
    console.log("\n파일 분류: 기록 없음");
  }
  summarize("문항 파싱 (기출 하나)", parses);
  summarize("채점 기준 분석 (기출 하나)", analyses);

  console.log("\n=== 답안마다 드는 값 (학생 수 × 문항 수만큼 되풀이) ===");
  summarize("첨삭 (답안 한 편)", corrections);

  const perExam =
    (parses.reduce((s, r) => s + cost(r), 0) / Math.max(1, parses.length)) +
    (analyses.reduce((s, r) => s + cost(r), 0) / Math.max(1, analyses.length));
  const perAnswer = corrections.reduce((s, r) => s + cost(r), 0) / Math.max(1, corrections.length);

  console.log("\n=== 대충 이런 셈 ===");
  for (const students of [10, 30]) {
    console.log(
      `  학생 ${students}명에게 기출 1개(문항 2개)를 내주면` +
        ` 준비 $${perExam.toFixed(2)} + 첨삭 $${(perAnswer * students * 2).toFixed(2)}` +
        ` = $${(perExam + perAnswer * students * 2).toFixed(2)}`,
    );
  }
}

main();
