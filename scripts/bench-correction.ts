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

import { anthropic } from "@/lib/anthropic/client";
import { correctAnswer, type CorrectionOptions } from "@/lib/anthropic/correct";
import { toAnalysis, toQuestion } from "@/lib/exam/store";
import type { Question } from "@/lib/types/exam";

/** 100만 토큰당 달러 (입력 / 출력) */
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

const CONFIGS: { label: string; options: CorrectionOptions }[] = [
  { label: "opus-5 · 기본", options: { model: "claude-opus-5" } },
  { label: "opus-5 · low", options: { model: "claude-opus-5", effort: "low" } },
  { label: "sonnet-5 · medium", options: { model: "claude-sonnet-5", effort: "medium" } },
  { label: "sonnet-5 · low", options: { model: "claude-sonnet-5", effort: "low" } },
];

/**
 * 설정별 차이를 보려면 답안이 그 문항에 **실제로 답하는 글**이어야 한다.
 * 엉뚱한 글을 넣으면 어떤 설정이든 0점을 줘서 견줄 것이 없다.
 * 그래서 문항을 보고 "학생이 쓸 법한 답안"을 한 번 만들어 모든 설정에 같이 쓴다.
 */
async function draftAnswer(question: Question, target: number): Promise<string> {
  const passages = question.passages.map((p) => `[제시문 ${p.label}]\n${p.text}`).join("\n\n");

  const stream = anthropic().messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content:
          "아래 논술 문항에 대해 **중상위권 학생이 쓸 법한 답안**을 한 편 써라.\n" +
          "완벽하지 않아도 된다 — 논지는 잡되 제시문 인용이 다소 성기고 " +
          "결론이 조금 약한, 첨삭할 거리가 있는 글이면 좋다.\n" +
          `분량은 ${target}자 안팎. 답안 본문만 출력하고 다른 말은 붙이지 마라.\n\n` +
          `[논제]\n${question.prompt}\n\n${passages}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

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
  console.log(`논제: ${question.prompt.slice(0, 70)}…`);

  const target = question.charTarget ?? 600;
  const ANSWER = await draftAnswer(question, target);
  console.log(`답안: ${ANSWER.length}자 (요구 ${target}자) · 배점 항목 ${analysis.rubric.items.length}개`);
  console.log(`  ${ANSWER.slice(0, 70)}…\n`);
  console.log("설정".padEnd(20) + "출력".padStart(9) + "비용".padStart(10) + "  점수  코멘트              예시  시간");
  console.log("─".repeat(86));

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

      const good = result.inlineComments.filter((c) => c.severity === "good").length;
      const bad = result.inlineComments.filter(
        (c) => c.severity === "error" || c.severity === "warning",
      ).length;

      console.log(
        config.label.padEnd(20) +
          result.usage.outputTokens.toLocaleString().padStart(9) +
          `$${cost.toFixed(3)}`.padStart(10) +
          `${String(result.scores.total).padStart(6)}` +
          `${String(result.inlineComments.length).padStart(6)}(좋음 ${good}·지적 ${bad})`.padEnd(20) +
          `${String(result.revisedExample.length).padStart(5)}자` +
          `${String(Math.round((Date.now() - started) / 1000)).padStart(5)}초`,
      );
      console.log(`  └ 총평: ${result.overall.summary.slice(0, 90)}…`);
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
