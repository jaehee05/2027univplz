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

  return (
    <PrintFrame
      title="첨삭 결과지"
      subtitle={`${assignment.studentName} · ${assignment.examTitle} ${assignment.questionNumber}번`}
    >
      <header className="flex items-end justify-between border-b-2 border-neutral-900 pb-2">
        <div>
          <p className="text-sm">
            {assignment.univName} · {assignment.examTitle}
          </p>
          <p className="font-bold">
            문제 {assignment.questionNumber}
            {assignment.charTarget ? ` (${assignment.charTarget}자 내외)` : ""} ·{" "}
            {assignment.studentName}
          </p>
        </div>
        <p className="text-2xl font-bold">
          {total}
          <span className="text-base font-normal"> / 100</span>
        </p>
      </header>

      <section className="print-block mt-5">
        <h2 className="text-sm font-bold">[채점]</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {correction.scores.items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-200 align-top">
                <td className="w-44 py-1.5 font-medium">{item.name}</td>
                <td className="w-16 py-1.5 text-right tabular-nums">
                  {item.awarded} / {item.points}
                </td>
                <td className="py-1.5 pl-3 leading-6">{item.reason}</td>
              </tr>
            ))}
            {correction.scores.deductions.map((deduction, index) => (
              <tr key={`d${index}`} className="border-b border-neutral-200 align-top">
                <td className="py-1.5 font-medium">{deduction.name}</td>
                <td className="py-1.5 text-right tabular-nums">−{deduction.points}</td>
                <td className="py-1.5 pl-3 leading-6">{deduction.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold">[답안]</h2>
        <div className="mt-2">
          <PrintSheet
            text={answer?.text ?? ""}
            lengthRule={lengthRuleOf(assignment)}
            label={`문제 ${assignment.questionNumber}`}
            comments={correction.inlineComments}
          />
        </div>
      </section>

      <section className="print-page mt-6">
        <h2 className="text-sm font-bold">[코멘트]</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {correction.inlineComments.map((comment, index) => (
            <li key={index} className="print-block border-b border-neutral-200 pb-2">
              <p className="font-medium">
                {SEVERITY_MARK[comment.severity]} {comment.category} ·{" "}
                {SEVERITY_LABEL[comment.severity]}
                <span className="ml-2 font-normal text-neutral-500">
                  {comment.start + 1}~{comment.end}자 — “
                  {(answer?.text ?? "").slice(comment.start, comment.end)}”
                </span>
              </p>
              <p className="mt-0.5 leading-6">{comment.message}</p>
              {comment.suggestion ? (
                <p className="mt-0.5 leading-6">→ {comment.suggestion}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="print-block mt-6">
        <h2 className="text-sm font-bold">[총평]</h2>
        <p className="mt-1 leading-7 whitespace-pre-wrap">{correction.overall.summary}</p>

        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-bold">잘한 점</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 leading-6">
              {correction.overall.strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold">고칠 점</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 leading-6">
              {correction.overall.improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {correction.overall.nextSteps.length > 0 ? (
          <div className="mt-3 border border-neutral-300 p-3 text-sm">
            <h3 className="font-bold">다음 답안에서 바로 할 것</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 leading-6">
              {correction.overall.nextSteps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {correction.revisedExample ? (
        <section className="print-block mt-6">
          <h2 className="text-sm font-bold">[고쳐 쓴 예시]</h2>
          <p className="mt-1 leading-8 whitespace-pre-wrap">{correction.revisedExample}</p>
        </section>
      ) : null}
    </PrintFrame>
  );
}
