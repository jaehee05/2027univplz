"use client";

import { useMemo } from "react";

import { ACCENT, HIGHLIGHT, WEIGHT, markLabel, type Severity } from "@/components/correction/tone";
import type { InlineComment } from "@/lib/types/work";

type Numbered = InlineComment & { index: number };

interface Segment {
  text: string;
  /** 칠할 색을 정하는 코멘트 — 겹치면 가장 센 쪽 */
  comment: Numbered | null;
  /** 이 조각을 덮는 코멘트 전부. 겹쳐도 고른 것이 표시되게 하려고 쥔다 */
  covering: Numbered[];
  /** 이 자리에서 **시작하는** 코멘트 전부. 번호를 여기 붙인다 */
  startsHere: Numbered[];
}

/**
 * 답안을 줄글로 펼쳐 코멘트 구간에 형광펜을 칠한다.
 * 원고지는 칸 위치를 보기엔 좋지만 문장을 읽기엔 불편해서, 읽을 때 쓰는 화면이다.
 *
 * 구간은 반드시 **인라인 요소**(`<mark>`)여야 한다. `<button>` 은 inline-block 이라
 * 줄바꿈을 가로지르지 못하고, 두 줄 넘게 걸친 구간이 한 덩어리 사각형이 되어
 * 뒷줄 글자를 덮어 버린다. 조각마다 끝을 다듬는 `box-decoration-clone` 도 같은 이유로 한 벌이다.
 *
 * 코멘트는 서로 겹친다 — 한 구간을 통째로 감싸는 더 넓은 코멘트가 있을 수 있다.
 * 색은 가장 센 쪽 하나로 칠하되, **번호는 시작하는 코멘트마다 모두** 붙인다.
 * 그러지 않으면 안쪽에 든 코멘트가 목록에만 있고 본문에서는 찾을 수 없다.
 */
export function AnswerProse({
  text,
  comments,
  activeIndex,
  onSelect,
}: {
  text: string;
  comments: Numbered[];
  activeIndex: number | null;
  /** 없으면(인쇄) 누를 수 없는 형광펜만 칠한다 */
  onSelect?: (index: number) => void;
}) {
  const segments = useMemo<Segment[]>(() => {
    // 구간이 겹칠 수 있으므로 경계마다 끊는다.
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
          : covering.reduce((best, c) =>
              WEIGHT[c.severity as Severity] > WEIGHT[best.severity as Severity] ? c : best,
            );

      result.push({
        text: text.slice(from, to),
        comment: winner,
        covering,
        // 번호 순으로 둔다 — 나란히 놓이므로 읽는 차례가 어긋나지 않게.
        startsHere: covering
          .filter((c) => c.start === from)
          .sort((a, b) => a.index - b.index),
      });
    }
    return result;
  }, [comments, text]);

  return (
    // 번호가 글줄 위에 앉으므로 줄 간격을 넉넉히 둔다.
    <p className="leading-[2.6] break-keep whitespace-pre-wrap">
      {segments.map((segment, index) =>
        segment.comment ? (
          <mark
            key={index}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={segment.covering.map((c) => `코멘트 ${c.index}번`).join(", ")}
            onClick={onSelect ? () => onSelect(segment.comment!.index) : undefined}
            onKeyDown={
              onSelect
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(segment.comment!.index);
                    }
                  }
                : undefined
            }
            className={[
              // relative + box-decoration-clone — 여러 줄에 걸쳐도 조각마다 따로 칠해진다.
              "relative box-decoration-clone rounded-[3px] px-[1px] text-inherit",
              onSelect ? "cursor-pointer" : "",
              HIGHLIGHT[segment.comment.severity as Severity],
              // 고른 코멘트가 이 조각을 덮고 있으면 — 겹쳐서 색을 뺏겼어도 — 표시한다.
              activeIndex != null && segment.covering.some((c) => c.index === activeIndex)
                ? "shadow-[inset_0_-2px_0_0_currentColor] brightness-95"
                : "",
            ].join(" ")}
          >
            {segment.startsHere.length > 0 ? (
              // 구간 **위**에 뜨는 번호. absolute 라 첫 조각 머리에만 붙고 줄 높이를 늘리지 않는다.
              <span className="pointer-events-none absolute -top-[1.15em] left-0 flex gap-[3px] text-[11px] leading-none font-bold tracking-tight tabular-nums">
                {segment.startsHere.map((comment) => (
                  <span
                    key={comment.index}
                    className={
                      activeIndex === comment.index
                        ? "text-neutral-900 underline underline-offset-2"
                        : ACCENT[comment.severity as Severity]
                    }
                  >
                    {markLabel(comment.index)}
                  </span>
                ))}
              </span>
            ) : null}
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
