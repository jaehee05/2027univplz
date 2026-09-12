import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { loadForPrint } from "@/lib/work/print";
import { lengthRuleOf } from "@/lib/work/store";

export default async function PrintSheetPage({ params }: PageProps<"/print/sheet/[assignmentId]">) {
  const { assignmentId } = await params;
  const { assignment, rows } = await loadForPrint({ assignmentId });

  return (
    <PrintFrame
      title="빈 답안지"
      subtitle={`${assignment.univName} ${assignment.examTitle} · 문항 ${rows.length}개`}
      wide
    >
      {rows.map(({ question }) => (
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
            <p className="text-sm">이름 ____________</p>
          </header>

          <PrintSheet lengthRule={lengthRuleOf(question)} label={`문제 ${question.number}`} />
        </div>
      ))}
    </PrintFrame>
  );
}
