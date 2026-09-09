import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { lengthRuleOf, loadForPrint } from "@/lib/work/print";

export default async function PrintAnswerPage({ params }: PageProps<"/print/answer/[answerId]">) {
  const { answerId } = await params;
  const { assignment, answer } = await loadForPrint({ answerId });

  return (
    <PrintFrame
      title="작성된 답안지"
      subtitle={`${assignment.studentName} · ${assignment.examTitle} ${assignment.questionNumber}번`}
    >
      <header className="mb-4 flex items-end justify-between border-b border-neutral-300 pb-2">
        <div>
          <p className="text-sm">
            {assignment.univName} · {assignment.examTitle}
          </p>
          <p className="font-bold">
            문제 {assignment.questionNumber}
            {assignment.charTarget ? ` (${assignment.charTarget}자 내외)` : ""}
          </p>
        </div>
        <p className="text-sm">
          {assignment.studentName} · {answer?.charCount ?? 0}자
        </p>
      </header>

      <PrintSheet
        text={answer?.text ?? ""}
        lengthRule={lengthRuleOf(assignment)}
        label={`문제 ${assignment.questionNumber}`}
      />
    </PrintFrame>
  );
}
