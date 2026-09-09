import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { lengthRuleOf, loadForPrint } from "@/lib/work/print";

export default async function PrintSheetPage({ params }: PageProps<"/print/sheet/[assignmentId]">) {
  const { assignmentId } = await params;
  const { assignment } = await loadForPrint({ assignmentId });

  return (
    <PrintFrame
      title="빈 답안지"
      subtitle={`${assignment.univName} ${assignment.examTitle} ${assignment.questionNumber}번`}
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
        <p className="text-sm">이름 ____________</p>
      </header>

      <PrintSheet
        lengthRule={lengthRuleOf(assignment)}
        label={`문제 ${assignment.questionNumber}`}
      />
    </PrintFrame>
  );
}
