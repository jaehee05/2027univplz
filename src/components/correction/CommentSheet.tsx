"use client";

import { useEffect } from "react";

import { ACCENT, DOT, markLabel, type Severity } from "@/components/correction/tone";
import { SEVERITY_LABEL, type InlineComment } from "@/lib/types/work";

type Numbered = InlineComment & { index: number };

/**
 * 좁은 화면에서 형광펜을 누르면 아래에서 올라오는 코멘트 카드.
 *
 * 목록을 옆에 둘 폭이 없는 화면에서, 본문은 그대로 두고 코멘트만 겹쳐 보여 준다.
 * 좌우 화살표로 다음·이전 코멘트로 넘어가며 읽는다.
 */
export function CommentSheet({
  comments,
  activeIndex,
  answerText,
  onSelect,
  onClose,
}: {
  /** 지금 걸러 보고 있는 코멘트 전부 — 넘겨 읽는 차례가 된다 */
  comments: Numbered[];
  activeIndex: number | null;
  answerText: string;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const at = comments.findIndex((comment) => comment.index === activeIndex);
  const current = at >= 0 ? comments[at] : null;

  // 시트가 열린 동안은 Esc 로 닫는다.
  useEffect(() => {
    if (!current) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && at > 0) onSelect(comments[at - 1].index);
      if (event.key === "ArrowRight" && at < comments.length - 1) {
        onSelect(comments[at + 1].index);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, comments, current, onClose, onSelect]);

  if (!current) return null;

  const severity = current.severity as Severity;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 xl:hidden"
      role="dialog"
      aria-label={`코멘트 ${current.index}번`}
    >
      <div
        className="rounded-t-2xl border-t border-neutral-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
        // 홈 인디케이터가 있는 기기에서 버튼이 가려지지 않게 한다.
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
      >
        {/* 손잡이 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex w-full justify-center py-2.5"
        >
          <span className="h-1 w-10 rounded-full bg-neutral-300" />
        </button>

        <div className="max-h-[52vh] overflow-y-auto px-4 pb-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={`font-bold tabular-nums ${ACCENT[severity]}`}>
              {markLabel(current.index)}
            </span>
            <span className="font-medium">{current.category}</span>
            <span className="flex items-center gap-1.5 text-neutral-500">
              <span className={`h-2 w-2 rounded-full ${DOT[severity]}`} />
              {SEVERITY_LABEL[severity]}
            </span>
          </p>

          <p className="mt-2 border-l-2 border-neutral-300 pl-2 text-sm text-neutral-500 italic">
            “{answerText.slice(current.start, current.end)}”
          </p>

          <p className="mt-2.5 leading-7">{current.message}</p>

          {current.suggestion ? (
            <p className="mt-2.5 rounded-md bg-neutral-100 px-3 py-2 leading-7">
              <b className="text-neutral-500">고쳐 쓰면</b> {current.suggestion}
            </p>
          ) : null}
        </div>

        {/* 넘겨 읽기 */}
        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 pt-2.5">
          <button
            type="button"
            disabled={at <= 0}
            onClick={() => onSelect(comments[at - 1].index)}
            className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-30"
          >
            ‹ 이전
          </button>
          <span className="text-sm text-neutral-500 tabular-nums">
            {at + 1} / {comments.length}
          </span>
          <button
            type="button"
            disabled={at >= comments.length - 1}
            onClick={() => onSelect(comments[at + 1].index)}
            className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-30"
          >
            다음 ›
          </button>
        </div>
      </div>
    </div>
  );
}
