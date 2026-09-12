import { mergePassages } from "@/lib/exam/passages";
import type { Assignment } from "@/lib/types/work";
import type { PrintRow } from "@/lib/work/print";

/** 문제지 — 논제 전부와 제시문. 답안지와 같은 종이 폭에 맞춘다. */
export function ExamPaper({
  assignment,
  rows,
}: {
  assignment: Assignment;
  rows: PrintRow[];
}) {
  // 실제 문제지처럼 제시문을 앞에 모으고, 논제는 뒤에 차례로 싣는다.
  const passages = mergePassages(rows.map((row) => row.source?.passages));

  return (
    <article>
      <header className="border-b-2 border-neutral-900 pb-3">
        <p className="text-sm">{assignment.univName}</p>
        <h2 className="mt-1 text-lg font-bold">
          {assignment.examTitle}
          <span className="ml-2 text-sm font-normal">문항 {rows.length}개</span>
        </h2>
      </header>

      {passages.map((passage) => (
        <section key={passage.label} className="print-block mt-5">
          <h3 className="text-sm font-bold">[제시문 {passage.label}]</h3>
          <p className="mt-1 leading-8 whitespace-pre-wrap">{passage.text}</p>
        </section>
      ))}

      <section className="print-block mt-5">
        <h3 className="text-sm font-bold">[논제]</h3>
        <ol className="mt-1 space-y-3">
          {rows.map(({ question, source }) => (
            <li key={question.questionId}>
              <p className="font-bold">
                문제 {question.number}
                {question.charTarget ? ` (${question.charTarget}자 내외)` : ""}
                {question.points ? ` · ${question.points}점` : ""}
              </p>
              <p className="mt-0.5 leading-8 whitespace-pre-wrap">{question.prompt}</p>
              {source?.lengthNote ? (
                <p className="mt-0.5 text-sm text-neutral-600">※ {source.lengthNote}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

    </article>
  );
}
