import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { ExamPaper } from "@/components/print/ExamPaper";
import { loadForPrint } from "@/lib/work/print";
import { lengthRuleOf } from "@/lib/work/store";

export default async function PrintExamPage({ params }: PageProps<"/print/exam/[assignmentId]">) {
  const { assignmentId } = await params;
  const { assignment, rows } = await loadForPrint({ assignmentId });

  return (
    <PrintFrame
      title="문제지"
      subtitle={`${assignment.univName} ${assignment.examTitle} · 문항 ${rows.length}개 · 빈 답안지 포함`}
    >
      <div className="print-page">
        <ExamPaper assignment={assignment} rows={rows} />
      </div>

      {/* 문제지는 세로로 읽고, 원고지는 칸이 커야 하니 가로로 낸다. 답안지는 문항마다 한 장. */}
      {rows.map(({ question }) => (
        <div key={question.questionId} className="print-landscape mt-10 print:mt-0">
          <h2 className="mb-3 text-sm font-bold">
            [답안지] {assignment.univName} {assignment.examTitle} {question.number}번
            {question.charTarget ? ` (${question.charTarget}자 내외)` : ""}
          </h2>
          <PrintSheet lengthRule={lengthRuleOf(question)} label={`문제 ${question.number}`} />
        </div>
      ))}
    </PrintFrame>
  );
}
