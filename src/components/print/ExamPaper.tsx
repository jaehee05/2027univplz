import type { Question } from "@/lib/types/exam";
import type { Assignment } from "@/lib/types/work";

/** 문제지 — 논제와 제시문. 답안지와 같은 종이 폭에 맞춘다. */
export function ExamPaper({
  assignment,
  question,
}: {
  assignment: Assignment;
  question: Question | null;
}) {
  return (
    <article>
      <header className="border-b-2 border-neutral-900 pb-3">
        <p className="text-sm">
          {assignment.univName} · {assignment.examTitle}
        </p>
        <h2 className="mt-1 text-lg font-bold">
          문제 {assignment.questionNumber}
          {assignment.charTarget ? ` (${assignment.charTarget}자 내외)` : ""}
          {question?.points ? ` · ${question.points}점` : ""}
        </h2>
      </header>

      <section className="print-block mt-5">
        <h3 className="text-sm font-bold">[논제]</h3>
        <p className="mt-1 leading-8 whitespace-pre-wrap">{assignment.questionPrompt}</p>
      </section>

      {question?.passages.map((passage) => (
        <section key={passage.label} className="print-block mt-5">
          <h3 className="text-sm font-bold">[제시문 {passage.label}]</h3>
          <p className="mt-1 leading-8 whitespace-pre-wrap">{passage.text}</p>
        </section>
      ))}

      {question?.lengthNote ? (
        <p className="mt-6 border-t border-neutral-300 pt-3 text-sm">
          ※ {question.lengthNote}
        </p>
      ) : null}
    </article>
  );
}
