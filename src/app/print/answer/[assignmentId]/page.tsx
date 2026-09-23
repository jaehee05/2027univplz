import type { Metadata } from "next";

import { PrintFrame } from "@/components/print/PrintFrame";
import { PrintSheet } from "@/components/print/PrintSheet";
import { loadForPrint } from "@/lib/work/print";
import { lengthRuleOf } from "@/lib/work/store";
import { paperTitleFor } from "@/lib/work/summary";

export const metadata: Metadata = { title: "작성된 답안지" };

export default async function PrintAnswerPage({
  params,
}: PageProps<"/print/answer/[assignmentId]">) {
  const { assignmentId } = await params;
  const { assignment, rows } = await loadForPrint({ assignmentId });

  // 학생에게는 선생님이 정한 이름만 보인다 — 대학·학년도를 알면 해설을 찾아 베낀다.
  const paper = paperTitleFor(assignment);

  return (
    <PrintFrame
      title="작성된 답안지"
      subtitle={`${assignment.studentName} · ${paper.title} · 문항 ${rows.length}개`}
      wide
    >
      {rows.map(({ question, answer }) => (
        <div key={question.questionId} className="print-landscape">
          <header className="mb-4 flex items-end justify-between border-b border-neutral-300 pb-2">
            <div>
              <p className="text-sm">
                {paper.subtitle ? `${paper.subtitle} · ` : ""}
                {paper.title}
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
            literal={answer?.literal ?? false}
            lengthRule={lengthRuleOf(question)}
            label={`문제 ${question.number}`}
          />
        </div>
      ))}
    </PrintFrame>
  );
}
