import { ACCENT, markLabel, type Severity } from "@/components/correction/tone";
import { SEVERITY_LABEL, type InlineComment } from "@/lib/types/work";

/**
 * 코멘트 카드 속. 화면 목록과 인쇄물이 같은 모양을 쓴다.
 * 겉(누를 수 있는 단추인지, 테두리 색)은 쓰는 쪽에서 두른다.
 */
export function CommentBody({
  comment,
  answerText,
}: {
  comment: InlineComment & { index: number };
  answerText: string;
}) {
  const severity = comment.severity as Severity;
  return (
    <>
      <span className={`shrink-0 font-bold tabular-nums ${ACCENT[severity]}`}>
        {markLabel(comment.index)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-500">
          <span className="font-medium text-neutral-700">{comment.category}</span>
          <span>{SEVERITY_LABEL[severity]}</span>
          <span className="ml-auto">
            {comment.start + 1}~{comment.end}자
          </span>
        </span>

        <span className="mt-1 block border-l-2 border-neutral-300 pl-2 text-neutral-500 italic">
          “{answerText.slice(comment.start, comment.end)}”
        </span>

        <span className="mt-1.5 block leading-6">{comment.message}</span>

        {comment.suggestion ? (
          <span className="mt-1.5 block rounded-md bg-white/80 px-2 py-1 leading-6">
            <b className="text-neutral-500">고쳐 쓰면</b> {comment.suggestion}
          </span>
        ) : null}
      </span>
    </>
  );
}
