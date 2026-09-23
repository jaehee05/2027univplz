import type { Metadata } from "next";

import { AnswerProse } from "@/components/correction/AnswerProse";
import { CommentBody } from "@/components/correction/CommentBody";
import { CARD, numbered, type Severity } from "@/components/correction/tone";
import { PrintFrame } from "@/components/print/PrintFrame";
import { loadForPrint, type PrintRow } from "@/lib/work/print";
import { totalScore, type Assignment } from "@/lib/types/work";
import { paperTitleFor } from "@/lib/work/summary";

export const metadata: Metadata = { title: "첨삭 결과지" };

/**
 * 첨삭지 한 벌 — 문항 하나. 세로 A4.
 * 화면의 '줄글' 보기와 같은 모양이다 — 형광펜을 칠한 답안 아래에 코멘트 카드.
 * 총평부터 고쳐 쓴 예시까지는 선생님 손글씨 글꼴로 쓴다.
 */
function CorrectionSet({
  assignment,
  row,
  summary,
}: {
  assignment: Assignment;
  row: PrintRow;
  /** 첫 벌에만 붙이는 시험지 전체 점수표 */
  summary: { number: string; total: number | null }[] | null;
}) {
  const { question, answer, correction } = row;
  if (!correction) return null;

  // 학생에게는 선생님이 정한 이름만 보인다.
  const paper = paperTitleFor(assignment);

  const total = totalScore(correction.scores);
  const earned = correction.scores.items.reduce((sum, item) => sum + item.awarded, 0);
  const lost = correction.scores.deductions.reduce((sum, item) => sum + item.points, 0);
  const text = answer?.text ?? "";

  // 답안 순서대로 번호를 매긴다 — 원고지에 붙는 번호와 같다.
  const comments = numbered(correction.inlineComments, text);

  return (
    <>
      <section className="print-page">
        <header className="flex items-end justify-between border-b-2 border-neutral-900 pb-2">
          <div>
            <p className="text-sm">
              {paper.subtitle ? `${paper.subtitle} · ` : ""}
              {paper.title}
            </p>
            <p className="text-base font-bold">
              문제 {question.number}
              {question.charTarget ? ` (${question.charTarget}자 내외)` : ""} ·{" "}
              {assignment.studentName}
              <span className="ml-2 font-normal text-neutral-500">{answer?.charCount ?? 0}자</span>
            </p>
          </div>
          <p className="text-right">
            <span className="text-3xl font-bold">{total}</span>
            <span className="text-base"> / 100</span>
            {lost > 0 ? (
              <span className="block text-xs text-neutral-500">
                {earned} − 감점 {lost}
              </span>
            ) : null}
          </p>
        </header>

        {summary && summary.length > 1 ? (
          <p className="mt-1 text-xs text-neutral-600">
            이 시험지 전체 —{" "}
            {summary
              .map((item) => `${item.number}번 ${item.total == null ? "—" : `${item.total}점`}`)
              .join(" · ")}
          </p>
        ) : null}

        <div className="mt-2">
          <h2 className="text-sm font-bold">[채점]</h2>
          <div className="mt-1 grid grid-cols-2 gap-x-6 text-xs">
            {correction.scores.items.map((item) => (
              <div
                key={item.id}
                className="print-block flex justify-between gap-2 border-b border-neutral-200 py-0.5"
              >
                <span className="font-medium">{item.name}</span>
                <span className="shrink-0 tabular-nums">
                  {item.awarded} / {item.points}
                </span>
              </div>
            ))}
            {correction.scores.deductions.map((deduction, index) => (
              <div
                key={`d${index}`}
                className="print-block flex justify-between gap-2 border-b border-neutral-200 py-0.5"
              >
                <span>{deduction.name}</span>
                <span className="shrink-0 tabular-nums">−{deduction.points}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 답안은 줄글에 형광펜, 코멘트 카드는 그 아래에 */}
        <div className="mt-4">
          <div className="rounded-lg border border-neutral-200 px-4 py-1">
            <AnswerProse text={text} comments={comments} activeIndex={null} />
          </div>
          <ul className="mt-4 space-y-2 text-[9pt] leading-snug">
            {comments.map((comment) => (
              <li
                key={comment.index}
                className={`print-block flex gap-1.5 rounded-lg border px-2 py-1.5 ${CARD[comment.severity as Severity]}`}
              >
                <CommentBody comment={comment} answerText={text} />
              </li>
            ))}
          </ul>
        </div>

        <div className="font-hand mt-6">
        <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold">
          [총평] {question.number}번
        </h2>
        <p className="mt-2 leading-6 whitespace-pre-wrap">{correction.overall.summary}</p>

        <div className="mt-3 grid grid-cols-2 gap-6 text-xs">
          <div className="print-block">
            <h3 className="font-bold">잘한 점</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-5">
              {correction.overall.strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="print-block">
            <h3 className="font-bold">고칠 점</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 leading-5">
              {correction.overall.improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {correction.overall.nextSteps.length > 0 ? (
          <div className="print-block mt-3 border border-neutral-400 p-2 text-xs">
            <h3 className="font-bold">다음 답안에서 바로 할 것</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-5">
              {correction.overall.nextSteps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {correction.revisedExample ? (
          <div className="mt-4">
            <h2 className="border-b border-neutral-400 pb-1 text-sm font-bold">
              [고쳐 쓴 예시]
              <span className="ml-2 font-normal text-neutral-500">
                내가 쓴 답안의 논지를 살려 구성과 문장만 손본 것 ·{" "}
                {correction.revisedExample.length}자
              </span>
            </h2>
            <p className="mt-2 leading-6 break-keep whitespace-pre-wrap">
              {correction.revisedExample}
            </p>
          </div>
        ) : null}
        </div>
      </section>
    </>
  );
}

export default async function PrintCorrectionPage({
  params,
}: PageProps<"/print/correction/[assignmentId]">) {
  const { assignmentId } = await params;
  const { assignment, rows } = await loadForPrint({ assignmentId, requirePublished: true });

  const done = rows.filter((row) => row.correction?.status === "done");
  const summary = done.map((row) => ({
    number: row.question.number,
    total: row.correction ? totalScore(row.correction.scores) : null,
  }));

  return (
    <PrintFrame
      title="첨삭 결과지"
      subtitle={`${assignment.studentName} · ${paperTitleFor(assignment).title} · 문항 ${done.length}개`}
    >
      {done.map((row, index) => (
        <CorrectionSet
          key={row.question.questionId}
          assignment={assignment}
          row={row}
          summary={index === 0 ? summary : null}
        />
      ))}
    </PrintFrame>
  );
}
