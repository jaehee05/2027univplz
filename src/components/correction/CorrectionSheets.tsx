"use client";

import { useState } from "react";

import { CorrectionView } from "@/components/correction/CorrectionView";
import type { LengthRule } from "@/lib/manuscript/spec";
import { totalScore, type Correction } from "@/lib/types/work";

export interface SheetRow {
  questionId: string;
  number: string;
  lengthRule: LengthRule | null;
  answerText: string;
  correction: Correction | null;
}

/**
 * 시험지 한 장으로 보는 첨삭 결과.
 * 채점은 문항마다 100점이라 점수를 합치지 않고 문항별로 나란히 놓는다.
 */
export function CorrectionSheets({ rows }: { rows: SheetRow[] }) {
  const [at, setAt] = useState(0);
  const current = rows[at];

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">아직 첨삭 결과가 없습니다.</p>;
  }

  return (
    <div>
      {rows.length > 1 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {rows.map((row, index) => {
            const score = row.correction ? totalScore(row.correction.scores) : null;
            return (
              <button
                key={row.questionId}
                type="button"
                onClick={() => setAt(index)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm",
                  index === at
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300",
                ].join(" ")}
              >
                {row.number}번
                <span className={index === at ? "ml-1.5 text-neutral-300" : "ml-1.5 text-neutral-500"}>
                  {score == null ? "첨삭 전" : `${score}점`}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {current.correction ? (
        <CorrectionView
          key={current.questionId}
          correction={current.correction}
          answerText={current.answerText}
          lengthRule={current.lengthRule}
          label={`문제 ${current.number}`}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          {current.number}번은 아직 첨삭 결과가 없습니다.
        </p>
      )}
    </div>
  );
}
