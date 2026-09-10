"use client";

import { useMemo } from "react";

import type { InlineComment } from "@/lib/types/work";

const TONE: Record<InlineComment["severity"], string> = {
  good: "bg-emerald-100 decoration-emerald-400",
  info: "bg-neutral-100 decoration-neutral-400",
  warning: "bg-amber-100 decoration-amber-400",
  error: "bg-red-100 decoration-red-400",
};

const WEIGHT: Record<InlineComment["severity"], number> = { info: 1, good: 2, warning: 3, error: 4 };

interface Segment {
  text: string;
  comment: (InlineComment & { index: number }) | null;
  /** 이 조각에서 코멘트가 시작되는가 — 번호를 여기 붙인다 */
  starts: boolean;
}

/**
 * 답안을 줄글로 펼쳐 코멘트 구간에 색을 입힌다.
 * 원고지는 칸 위치를 보기엔 좋지만 문장을 읽기엔 불편해서, 읽을 때 쓰는 화면이다.
 */
export function AnswerProse({
  text,
  comments,
  activeIndex,
  onSelect,
}: {
  text: string;
  comments: (InlineComment & { index: number })[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const segments = useMemo<Segment[]>(() => {
    // 구간이 겹칠 수 있으므로 경계마다 끊고, 각 조각은 가장 센 코멘트를 따른다.
    const edges = new Set<number>([0, text.length]);
    for (const comment of comments) {
      edges.add(Math.max(0, Math.min(comment.start, text.length)));
      edges.add(Math.max(0, Math.min(comment.end, text.length)));
    }
    const points = [...edges].sort((a, b) => a - b);

    const result: Segment[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i];
      const to = points[i + 1];
      if (to <= from) continue;

      const covering = comments.filter((c) => c.start <= from && c.end >= to);
      const winner =
        covering.length === 0
          ? null
          : covering.reduce((best, c) => (WEIGHT[c.severity] > WEIGHT[best.severity] ? c : best));

      result.push({
        text: text.slice(from, to),
        comment: winner,
        starts: winner ? winner.start === from : false,
      });
    }
    return result;
  }, [comments, text]);

  return (
    <p className="leading-[2.1] break-keep whitespace-pre-wrap">
      {segments.map((segment, index) =>
        segment.comment ? (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(segment.comment!.index)}
            className={[
              "cursor-pointer rounded-sm px-px text-left underline decoration-2 underline-offset-4",
              TONE[segment.comment.severity],
              activeIndex === segment.comment.index ? "ring-2 ring-neutral-900" : "",
            ].join(" ")}
          >
            {segment.starts ? (
              <span className="mr-0.5 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full bg-neutral-900 align-[2px] text-[10px] font-bold text-white">
                {segment.comment.index}
              </span>
            ) : null}
            {segment.text}
          </button>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
