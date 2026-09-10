/**
 * 첨삭 설정별로 비용과 결과를 견줘 본다.
 *   npm run bench:correction
 *
 * 실제로 Claude 를 여러 번 부르므로 돈이 든다(설정 하나에 $0.05~0.4).
 * 같은 답안 · 같은 채점 기준으로 돌려서 설정 말고는 조건을 같게 둔다.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

import { correctAnswer, type CorrectionOptions } from "@/lib/anthropic/correct";
import { toAnalysis, toQuestion } from "@/lib/exam/store";

/** 100만 토큰당 달러 (입력 / 출력) */
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

const CONFIGS: { label: string; options: CorrectionOptions }[] = [
  { label: "opus-5 · 기본", options: { model: "claude-opus-5" } },
  { label: "opus-5 · medium", options: { model: "claude-opus-5", effort: "medium" } },
  { label: "opus-5 · low", options: { model: "claude-opus-5", effort: "low" } },
  { label: "sonnet-5 · 기본", options: { model: "claude-sonnet-5" } },
  { label: "sonnet-5 · medium", options: { model: "claude-sonnet-5", effort: "medium" } },
  { label: "sonnet-5 · low", options: { model: "claude-sonnet-5", effort: "low" } },
];

const ANSWER =
  "근대의 공론장은 신분이 아니라 논거의 설득력이 의견의 우열을 가르는 공간이었다. " +
  "제시문 가는 커피하우스와 살롱에서 시작된 이 토론의 관행이 대중매체의 발달과 함께 " +
  "소비의 공간으로 바뀌었다고 지적한다. 시민은 토론의 참여자에서 여론의 수용자로 물러났다. " +
  "제시문 나가 말하는 알고리즘은 이 변화를 한층 심화시킨다. 이용자의 과거 선택을 학습한 " +
  "알고리즘은 기존 신념을 강화하는 정보만을 반복해서 보여 주고, 다른 견해는 시야에서 지운다. " +
  "그 결과 개인은 편해지지만 사회는 서로 다른 견해가 부딪히며 조정되는 학습의 기회를 잃는다. " +
  "이러한 변화는 민주주의의 기반을 흔든다. 민주주의는 다수의 결정이라는 절차만으로 성립하지 " +
  "않고, 결정에 앞서 서로의 근거를 검토하는 과정을 전제하기 때문이다. 검토가 사라진 자리에 " +
  "남는 것은 확신을 확인하는 절차뿐이다. 따라서 공론장의 회복은 정보의 양을 늘리는 것이 " +
  "아니라, 이질적인 견해와 마주칠 수밖에 없는 자리를 제도적으로 만드는 데서 시작해야 한다.";

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  // 확정된 채점 기준이 있는 기출 아무거나 하나
  let picked: { univId: string; examId: string; univName: string } | null = null;
  for (const univ of (await db.collection("universities").get()).docs) {
    for (const doc of (await univ.ref.collection("analyses").get()).docs) {
      if (doc.data().status === "confirmed") {
        picked = { univId: univ.id, examId: doc.id, univName: univ.data().name };
        break;
      }
    }
    if (picked) break;
  }
  if (!picked) throw new Error("확정된 채점 기준이 있는 기출이 없습니다.");

  const examRef = db.collection("universities").doc(picked.univId).collection("exams").doc(picked.examId);
  const exam = (await examRef.get()).data()!;
  const questionSnap = (await examRef.collection("questions").limit(1).get()).docs[0];
  const question = toQuestion(questionSnap);
  const analysis = toAnalysis(
    await db.collection("universities").doc(picked.univId).collection("analyses").doc(picked.examId).get(),
    picked.univId,
  );

  console.log(`기준: ${picked.univName} ${exam.year} ${exam.title} ${question.number}번`);
  console.log(`답안: ${ANSWER.length}자 · 배점 항목 ${analysis.rubric.items.length}개\n`);
  console.log("설정".padEnd(20) + "출력".padStart(9) + "입력".padStart(9) + "1회 비용".padStart(11) + "  점수  코멘트  예시  걸린 시간");
  console.log("─".repeat(84));

  for (const config of CONFIGS) {
    const started = Date.now();
    try {
      const result = await correctAnswer(
        {
          university: picked.univName,
          examTitle: `${exam.year}학년도 ${exam.title}`,
          question,
          analysis,
          answer: ANSWER,
          charCount: ANSWER.length,
          charCountNoSpace: ANSWER.replace(/\s/g, "").length,
        },
        config.options,
      );

      const [inPrice, outPrice] = PRICE[result.usage.model] ?? [5, 25];
      const cost =
        (result.usage.inputTokens / 1e6) * inPrice + (result.usage.outputTokens / 1e6) * outPrice;

      console.log(
        config.label.padEnd(20) +
          result.usage.outputTokens.toLocaleString().padStart(9) +
          result.usage.inputTokens.toLocaleString().padStart(9) +
          `$${cost.toFixed(3)}`.padStart(11) +
          `${String(result.scores.total).padStart(6)}` +
          `${String(result.inlineComments.length).padStart(7)}` +
          `${String(result.revisedExample.length).padStart(6)}자` +
          `${String(Math.round((Date.now() - started) / 1000)).padStart(5)}초`,
      );
    } catch (error) {
      console.log(
        config.label.padEnd(20) + `  ✖ ${error instanceof Error ? error.message : "실패"}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
