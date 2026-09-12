"use client";

import { useState } from "react";

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

/** 왼쪽 문제지 칸. 올려 둔 PDF 를 그대로 띄우고, 필요하면 글로 바꿔 본다. */
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
  const [mode, setMode] = useState<"pdf" | "text">(hasPdf ? "pdf" : "text");

  // 서버가 배정된 쪽만 잘라서 내보내므로 여기서는 통째로 열면 된다.
  // view=FitH — 브라우저 PDF 뷰어를 너비 맞춤으로 열어 준다(칸이 좁아도 글자가 읽힌다).
  const src = `/api/assignments/${assignmentId}/paper?v=${encodeURIComponent(version)}#view=FitH`;
  // 새 창은 보통 넓으니 그대로 연다.
  const popout = `/api/assignments/${assignmentId}/paper?v=${encodeURIComponent(version)}`;

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
            <div className="flex rounded-md border border-neutral-300 text-xs">
              {(["pdf", "text"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={[
                    "px-2 py-1",
                    mode === value ? "bg-neutral-900 text-white" : "text-neutral-600",
                    value === "pdf" ? "rounded-l-md" : "rounded-r-md",
                  ].join(" ")}
                >
                  {value === "pdf" ? "원본" : "글자"}
                </button>
              ))}
            </div>
          ) : null}
          <a
            href={popout}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
          >
            새 창
          </a>
        </div>
      </div>

      {mode === "pdf" && hasPdf ? (
        <object
          data={src}
          type="application/pdf"
          className="min-h-0 w-full flex-1 rounded-md border border-neutral-200 bg-neutral-50"
        >
          {/* 브라우저가 PDF 를 못 열 때 */}
          <div className="p-4 text-sm text-neutral-600">
            이 브라우저에서는 PDF 를 바로 열 수 없습니다.{" "}
            <a href={popout} target="_blank" rel="noreferrer" className="underline">
              새 창에서 열기
            </a>
            <button
              type="button"
              onClick={() => setMode("text")}
              className="ml-2 underline underline-offset-2"
            >
              글자로 보기
            </button>
          </div>
        </object>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto rounded-md border border-neutral-200 p-4">
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
                        {on ? <span className="ml-1.5 font-normal text-amber-700">지금 쓰는 문항</span> : null}
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

          {!hasPdf && passages.length === 0 ? (
            <p className="text-sm text-neutral-500">
              올려 둔 문제지가 없습니다. 논제만 보고 쓰시면 됩니다.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
