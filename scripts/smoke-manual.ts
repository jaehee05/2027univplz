/**
 * 직접 첨삭(내 Claude 구독으로 돌리고 결과만 넣기) 점검. npm run smoke:manual
 *
 * 사람이 claude.ai 에서 하는 일을 흉내 낸다 —
 * 앱이 만든 프롬프트를 그대로 모델에 넣고, 받은 답을 그대로 앱에 붙여 넣는다.
 * 사람이 하듯 코드 블록과 인사말이 섞인 답도 받아 내는지 함께 본다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
let cookie = "";

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text.slice(0, 300)}`);
  // 점검용이라 응답 모양은 느슨하게 다룬다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(text) as any;
}

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  const app = getApps()[0] ?? initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);

  const uid = (await db.collection("users").where("role", "==", "teacher").limit(1).get()).docs[0].id;
  const token = await getAuth(app).createCustomToken(uid, { role: "teacher" });
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    { method: "POST", body: JSON.stringify({ token, returnSecureToken: true }) },
  );
  const session = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: (await exchange.json()).idToken }),
  });
  cookie = (session.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  // 제출된 답안이 있는 과제를 찾는다.
  const mine = await api("/api/assignments");
  const assignment = mine.assignments.find(
    (a: { status: string }) => a.status === "submitted" || a.status === "corrected",
  );
  if (!assignment) throw new Error("제출된 답안이 없습니다. npm run smoke:practice 로 하나 만드세요.");
  console.log(`▶ 과제: ${assignment.studentName} · ${assignment.questionNumber}번`);

  console.log("▶ 앱이 프롬프트를 만든다");
  const built = await api(`/api/corrections/prompt?assignmentId=${assignment.id}`);
  console.log(`  ${built.prompt.length.toLocaleString()}자`);
  const hasSchema = built.prompt.includes('"revisedExample"') && built.prompt.includes("quote");
  console.log(`  ${hasSchema ? "✔" : "✖"} JSON 형식 안내가 들어 있다`);

  console.log("▶ 사람이 claude.ai 에 넣는 대신, 같은 프롬프트를 모델에 넣는다");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: built.prompt }],
  });
  const message = await stream.finalMessage();
  const answer = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  console.log(`  받은 답 ${answer.length.toLocaleString()}자 · 코드 블록 ${answer.includes("```") ? "있음" : "없음"}`);

  console.log("▶ 사람이 하듯 앞뒤에 말을 붙여서 붙여 넣는다");
  const messy = `네, 첨삭 결과입니다.\n\n${answer}\n\n도움이 되었길 바랍니다.`;
  const saved = await api("/api/corrections/manual", {
    method: "POST",
    body: JSON.stringify({ assignmentId: assignment.id, pasted: messy }),
  });

  const c = saved.correction;
  console.log(`  ✔ 저장됨 · ${c.scores.total}점 · 코멘트 ${saved.matched}/${saved.asked}개 자리 찾음`);
  console.log(`  항목: ${c.scores.items.map((i: { awarded: number; points: number }) => `${i.awarded}/${i.points}`).join(" ")}`);
  console.log(`  고쳐 쓴 예시 ${c.revisedExample.length}자 · 기록된 토큰 ${c.usage ? "있음(잘못됨)" : "없음 ✔"}`);

  const misplaced = c.inlineComments.filter(
    (x: { start: number; end: number }) => x.end <= x.start,
  ).length;
  console.log(`  ${misplaced === 0 ? "✔" : "✖"} 코멘트 위치가 모두 답안 안쪽`);

  // ── 문항 뽑기 · 채점 기준 분석도 같은 방식으로 되는지 ──────────
  const exams = await db.collection("universities").doc(assignment.univId).collection("exams").get();
  const exam = exams.docs.find((d) => d.id === assignment.examId);
  const base = `/api/universities/${assignment.univId}/exams/${assignment.examId}`;

  // 확정된 기준은 덮어쓰지 않게 막혀 있다. 그 경로를 확인하려면 잠시 풀어 둔다.
  const analysisPath = `/api/universities/${assignment.univId}/analyses/${assignment.examId}`;
  const before = await api(analysisPath).catch(() => ({ analysis: null }));
  const wasConfirmed = before.analysis?.status === "confirmed";
  if (wasConfirmed) {
    await api(analysisPath, { method: "PATCH", body: JSON.stringify({ status: "draft" }) });
    console.log("\n(확정을 잠시 풀었습니다 — 끝나고 되돌립니다)");
  }

  let failed = 0;
  for (const [label, path, check] of [
    ["문항 뽑기", "parse-questions", (d: { questions: unknown[] }) => `문항 ${d.questions.length}개`],
    [
      "채점 기준 분석",
      "analyze",
      (d: { analysis: { rubric: { items: unknown[] }; status: string } }) =>
        `항목 ${d.analysis.rubric.items.length}개 · ${d.analysis.status}`,
    ],
  ] as const) {
    console.log(`\n▶ ${label} — 프롬프트 만들기`);
    const built = await api(`${base}/${path}/prompt`);
    console.log(`  ${built.prompt.length.toLocaleString()}자`);

    console.log(`▶ ${label} — 모델에 넣고 받은 답을 붙여 넣기`);
    const stream2 = client.messages.stream({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: built.prompt }],
    });
    const got = (await stream2.finalMessage()).content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const saved2 = await api(`${base}/${path}/manual`, {
        method: "POST",
        body: JSON.stringify({ pasted: `알겠습니다.\n\n${got}\n\n확인해 주세요.` }),
      });
      console.log(`  ✔ ${check(saved2)}`);
    } catch (error) {
      console.log(`  ✖ ${error instanceof Error ? error.message : "실패"}`);
      failed += 1;
    }
  }

  if (wasConfirmed && exam) {
    // 풀어 둔 확정을 되돌린다.
    await api(analysisPath, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    }).catch(() =>
      console.log("  ⚠ 확정을 되돌리지 못했습니다 — 배점 합계가 100 인지 화면에서 확인하세요."),
    );
  }

  if (failed > 0) throw new Error(`${failed}가지가 실패했습니다.`);
  console.log("\n✔ 직접 돌리기 세 가지 모두 통과");
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
