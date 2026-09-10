import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { lengthRuleOf, loadForPrint } from "@/lib/work/print";
import { SEVERITY_LABEL, totalScore } from "@/lib/types/work";

const SEVERITY_MARK: Record<string, string> = {
  good: "○",
  info: "·",
  warning: "△",
  error: "×",
};

export default async function PrintCorrectionPage({
  params,
}: PageProps<"/print/correction/[correctionId]">) {
  const { correctionId } = await params;
  const { assignment, answer, correction } = await loadForPrint({
    correctionId,
    requirePublished: true,
  });

  if (!correction) return null;

  const total = totalScore(correction.scores);
  const earned = correction.scores.items.reduce((sum, item) => sum + item.awarded, 0);
  const lost = correction.scores.deductions.reduce((sum, item) => sum + item.points, 0);
  const text = answer?.text ?? "";

  // 답안 순서대로 번호를 매긴다 — 원고지에 붙는 번호와 같다.
  const comments = [...correction.inlineComments]
    .sort((a, b) => a.start - b.start)
    .map((comment, index) => ({ ...comment, index: index + 1 }));

  return (
    <PrintFrame
      title="첨삭 결과지"
      subtitle={`${assignment.studentName} · ${assignment.examTitle} ${assignment.questionNumber}번`}
      wide
    >
      {/* ── 1쪽: 점수와 답안 ─────────────────────────────────── */}
      <section className="print-landscape">
        <header className="flex items-end justify-between border-b-2 border-neutral-900 pb-2">
          <div>
            <p className="text-sm">
              {assignment.univName} · {assignment.examTitle}
            </p>
            <p className="text-base font-bold">
              문제 {assignment.questionNumber}
              {assignment.charTarget ? ` (${assignment.charTarget}자 내외)` : ""} ·{" "}
              {assignment.studentName}
              <span className="ml-2 font-normal text-neutral-500">
                {answer?.charCount ?? 0}자
              </span>
            </p>
          </div>
          <p className="text-right">
            <span className="text-3xl font-bold">{total}</span>
            <span className="text-base"> / 100</span>
            {lost > 0 ? (
              <span className="block text-xs text-neutral-500">
                {earned} − 감점 {lost}
              </span>
            ) : null}
          </p>
        </header>

        {/* 채점표를 위로 올린다. 원고지는 38칸 × 26px = 261mm 라 가로 폭을 통째로 써야 안 잘린다. */}
        <div className="mt-2">
          <h2 className="text-sm font-bold">[채점]</h2>
          <div className="mt-1 grid grid-cols-3 gap-x-6 text-xs">
            {correction.scores.items.map((item) => (
              <div
                key={item.id}
                className="print-block flex justify-between gap-2 border-b border-neutral-200 py-0.5"
              >
                <span className="font-medium">{item.name}</span>
                <span className="shrink-0 tabular-nums">
                  {item.awarded} / {item.points}
                </span>
              </div>
            ))}
            {correction.scores.deductions.map((deduction, index) => (
              <div
                key={`d${index}`}
                className="print-block flex justify-between gap-2 border-b border-neutral-200 py-0.5"
              >
                <span>{deduction.name}</span>
                <span className="shrink-0 tabular-nums">−{deduction.points}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <h2 className="text-sm font-bold">
            [답안]
            <span className="ml-2 font-normal text-neutral-500">
              번호는 뒷장 코멘트와 같습니다
            </span>
          </h2>
          <div className="mt-1">
            <PrintSheet
              text={text}
              lengthRule={lengthRuleOf(assignment)}
              label={`문제 ${assignment.questionNumber}`}
              comments={correction.inlineComments}
            />
          </div>
        </div>
      </section>

      {/* ── 2쪽: 코멘트 ──────────────────────────────────────── */}
      <section className="print-landscape">
        <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold">
          [코멘트] 번호는 앞장 답안에 붙은 번호와 같습니다
        </h2>
        <ol className="print-columns mt-2 text-xs">
          {comments.map((comment) => (
            <li key={comment.index} className="mb-2 flex gap-1.5 border-b border-neutral-200 pb-1.5">
              <span className="w-5 shrink-0 text-right font-bold">{comment.index}.</span>
              <span>
                <span className="font-medium">
                  {SEVERITY_MARK[comment.severity]} {comment.category} ·{" "}
                  {SEVERITY_LABEL[comment.severity]}
                </span>
                <span className="mt-0.5 block border-l-2 border-neutral-300 pl-1.5 text-neutral-500 italic">
                  “{text.slice(comment.start, comment.end)}”
                </span>
                <span className="mt-0.5 block leading-5">{comment.message}</span>
                {comment.suggestion ? (
                  <span className="mt-0.5 block leading-5">→ {comment.suggestion}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 3쪽: 총평과 고쳐 쓴 예시 ─────────────────────────── */}
      <section className="print-landscape">
        <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold">[총평]</h2>
        <p className="mt-2 leading-6 whitespace-pre-wrap">{correction.overall.summary}</p>

        <div className="mt-3 grid grid-cols-2 gap-6 text-xs">
          <div className="print-block">
            <h3 className="font-bold">잘한 점</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-5">
              {correction.overall.strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="print-block">
            <h3 className="font-bold">고칠 점</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-5">
              {correction.overall.improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {correction.overall.nextSteps.length > 0 ? (
          <div className="print-block mt-3 border border-neutral-400 p-2 text-xs">
            <h3 className="font-bold">다음 답안에서 바로 할 것</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-5">
              {correction.overall.nextSteps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {correction.revisedExample ? (
          <div className="mt-4">
            <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold">
              [고쳐 쓴 예시]
              <span className="ml-2 font-normal text-neutral-500">
                내가 쓴 답안의 논지를 살려 구성과 문장만 손본 것 · {correction.revisedExample.length}자
              </span>
            </h2>
            <p className="print-columns mt-2 leading-6 break-keep whitespace-pre-wrap">
              {correction.revisedExample}
            </p>
          </div>
        ) : null}
      </section>
    </PrintFrame>
  );
}
