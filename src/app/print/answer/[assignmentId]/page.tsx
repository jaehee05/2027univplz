import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { loadForPrint } from "@/lib/work/print";
import { lengthRuleOf } from "@/lib/work/store";

export default async function PrintAnswerPage({
  params,
}: PageProps<"/print/answer/[assignmentId]">) {
  const { assignmentId } = await params;
  const { assignment, rows } = await loadForPrint({ assignmentId });

  return (
    <PrintFrame
      title="작성된 답안지"
      subtitle={`${assignment.studentName} · ${assignment.examTitle} · 문항 ${rows.length}개`}
      wide
    >
      {rows.map(({ question, answer }) => (
        <div key={question.questionId} className="print-landscape">
          <header className="mb-4 flex items-end justify-between border-b border-neutral-300 pb-2">
            <div>
              <p className="text-sm">
                {assignment.univName} · {assignment.examTitle}
              </p>
              <p className="font-bold">
                문제 {question.number}
                {question.charTarget ? ` (${question.charTarget}자 내외)` : ""}
              </p>
            </div>
            <p className="text-sm">
              {assignment.studentName} · {answer?.charCount ?? 0}자
            </p>
          </header>

          <PrintSheet
            text={answer?.text ?? ""}
            lengthRule={lengthRuleOf(question)}
            label={`문제 ${question.number}`}
          />
        </div>
      ))}
    </PrintFrame>
  );
}
