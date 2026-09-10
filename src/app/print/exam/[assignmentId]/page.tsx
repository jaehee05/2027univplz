import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { ExamPaper } from "@/components/print/ExamPaper";
import { lengthRuleOf, loadForPrint } from "@/lib/work/print";

export default async function PrintExamPage({ params }: PageProps<"/print/exam/[assignmentId]">) {
  const { assignmentId } = await params;
  const { assignment, question } = await loadForPrint({ assignmentId });

  return (
    <PrintFrame
      title="문제지"
      subtitle={`${assignment.univName} ${assignment.examTitle} ${assignment.questionNumber}번 · 빈 답안지 포함`}
    >
      <div className="print-page">
        <ExamPaper assignment={assignment} question={question} />
      </div>

      {/* 문제지는 세로로 읽고, 원고지는 칸이 커야 하니 가로로 낸다. */}
      <div className="print-landscape mt-10 print:mt-0">
        <h2 className="mb-3 text-sm font-bold">
          [답안지] {assignment.univName} {assignment.examTitle} {assignment.questionNumber}번
        </h2>
        <PrintSheet
          lengthRule={lengthRuleOf(assignment)}
          label={`문제 ${assignment.questionNumber}`}
        />
      </div>
    </PrintFrame>
  );
}
