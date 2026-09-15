"use client";

import { PdfPages } from "@/components/manuscript/PdfPages";
import type { Passage } from "@/lib/types/exam";

/** 문제지에 실린 논제 하나 */
export interface PaperQuestion {
  questionId: string;
  number: string;
  prompt: string;
}

interface Props {
  assignmentId: string;
  /** 이 시험지의 논제 전부 */
  questions: PaperQuestion[];
  /** 지금 쓰고 있는 문항 — 그 논제를 도드라지게 한다 */
  activeQuestionId: string | null;
  /** 제시문. 여러 문항이 함께 쓰는 것은 한 번만 싣는다 */
  passages: Passage[];
  /** 문제지 PDF 가 있는지 — 없으면 글로만 보여 준다 */
  hasPdf: boolean;
  /** 한 PDF 안에서 이 시험이 차지하는 쪽 */
  pageFrom: number | null;
  pageTo: number | null;
  /** 파일이나 쪽 범위가 바뀌면 달라지는 값 — 브라우저가 예전 파일을 계속 쓰지 않게 한다 */
  version: string;
}

/**
 * 왼쪽 문제지 칸.
 *
 * 올려 둔 PDF 를 **쪽마다 그림으로 그려** 이어 붙인다(`PdfPages`).
 * 브라우저 PDF 뷰어를 띄우지 않는다 — 뷰어가 제 도구 모음과 스크롤을 달고 나와
 * 칸 안에 칸이 생기고, 답안을 쓰다 말고 뷰어를 조작하게 된다.
 *
 * PDF 가 없을 때만 글로 보여 준다(한글 문서로 올린 기출).
 */
export function PaperPane({
  assignmentId,
  questions,
  activeQuestionId,
  passages,
  hasPdf,
  pageFrom,
  pageTo,
  version,
}: Props) {
  // 서버가 배정된 쪽만 잘라서 내보내므로 여기서는 통째로 받으면 된다.
  const src = `/api/assignments/${assignmentId}/paper?v=${encodeURIComponent(version)}`;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 pb-2">
        <h2 className="text-sm font-semibold text-neutral-500">문제지</h2>
        <div className="flex items-center gap-2">
          {pageFrom || pageTo ? (
            <span
              className="text-xs text-neutral-400"
              title="원본 파일에서 이 시험이 차지하는 쪽입니다. 그 부분만 보입니다."
            >
              원본 {pageFrom ?? "처음"}~{pageTo ?? "끝"}쪽
            </span>
          ) : null}
          {hasPdf ? (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
            >
              새 창
            </a>
          ) : null}
        </div>
      </div>

      {hasPdf ? (
        // 스크롤은 이 칸 하나로 끝난다. 안쪽에 또 스크롤이 생기지 않게 한다.
        <PdfPages
          src={src}
          className="min-h-0 flex-1 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-100 p-3"
        />
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto rounded-md border border-neutral-200 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-500">논제</h3>
            <ol className="mt-1 space-y-3">
              {questions.map((question) => {
                const on = question.questionId === activeQuestionId;
                return (
                  <li
                    key={question.questionId}
                    className={[
                      "rounded-md",
                      on
                        ? "bg-amber-50 px-2 py-1.5 ring-1 ring-amber-200"
                        : questions.length > 1
                          ? "px-2 py-1.5 text-neutral-500"
                          : "",
                    ].join(" ")}
                  >
                    {questions.length > 1 ? (
                      <p className="text-sm font-bold">
                        문제 {question.number}
                        {on ? (
                          <span className="ml-1.5 font-normal text-amber-700">지금 쓰는 문항</span>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="mt-0.5 leading-7 whitespace-pre-wrap">{question.prompt}</p>
                  </li>
                );
              })}
            </ol>
          </div>

          {passages.map((passage) => (
            <div key={passage.label}>
              <h3 className="text-sm font-semibold text-neutral-500">제시문 {passage.label}</h3>
              <p className="mt-1 leading-7 whitespace-pre-wrap">{passage.text}</p>
            </div>
          ))}

          {passages.length === 0 ? (
            <p className="text-sm text-neutral-500">
              올려 둔 문제지가 없습니다. 논제만 보고 쓰시면 됩니다.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
