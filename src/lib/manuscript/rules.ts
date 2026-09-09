import type { LayoutResult } from "@/lib/manuscript/layout";
import { lengthRange, type LengthRule } from "@/lib/manuscript/spec";

export type RuleId =
  | "LENGTH_OVER"
  | "LENGTH_UNDER"
  | "INDENT_MANUAL"
  | "SPACE_DOUBLE"
  | "SPACE_BEFORE_PUNCT"
  | "BRACKET_UNBALANCED"
  | "AUTO_PUNCT_WRAPPED"
  | "AUTO_SPACE_DROPPED"
  | "AUTO_SPACE_AFTER_PUNCT"
  | "AUTO_BRACKET_PUSHED";

export type Severity = "error" | "warning" | "info";

/**
 * 첨삭 인라인 코멘트와 같은 자료 구조를 쓴다.
 * 위치는 원문 문자 오프셋 [start, end) 이라 원고지 규격이 바뀌어도 어긋나지 않는다.
 */
export interface RuleIssue {
  rule: RuleId;
  severity: Severity;
  message: string;
  start: number;
  end: number;
}

const OPENERS = "([{“‘「『〈《";
const CLOSERS = ")]}”’」』〉》";
const PUNCT_AFTER_SPACE = new Set([".", ",", "!", "?", ":", ";", "”", "’", ")", "]", "}"]);

function checkLength(layout: LayoutResult, rule: LengthRule | null): RuleIssue[] {
  if (!rule) return [];
  const { min, max } = lengthRange(rule);
  const count = layout.countWithSpace;
  const end = Math.max(0, layout.cells.at(-1)?.end ?? 0);

  if (count > max) {
    return [{
      rule: "LENGTH_OVER",
      severity: "error",
      message: `${count}자 — 허용 상한 ${max}자를 ${count - max}자 넘었습니다.`,
      start: Math.max(0, end - 1),
      end,
    }];
  }
  if (count > 0 && count < min) {
    return [{
      rule: "LENGTH_UNDER",
      severity: "warning",
      message: `${count}자 — 허용 하한 ${min}자에 ${min - count}자 모자랍니다.`,
      start: Math.max(0, end - 1),
      end,
    }];
  }
  return [];
}

function checkText(source: string): RuleIssue[] {
  const issues: RuleIssue[] = [];

  // 문단 앞 수동 들여쓰기 — 첫 칸은 자동으로 비우므로 공백을 직접 넣으면 두 칸이 빈다.
  const paragraphStart = /(^|\n)([ \t　]+)/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphStart.exec(source)) !== null) {
    const start = match.index + match[1].length;
    issues.push({
      rule: "INDENT_MANUAL",
      severity: "warning",
      message: "문단 첫 칸은 자동으로 비웁니다. 앞의 공백은 지워 주세요.",
      start,
      end: start + match[2].length,
    });
  }

  // 연속 띄어쓰기
  const doubleSpace = /[ 　]{2,}/g;
  while ((match = doubleSpace.exec(source)) !== null) {
    issues.push({
      rule: "SPACE_DOUBLE",
      severity: "warning",
      message: "띄어쓰기는 한 칸만 씁니다.",
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // 문장부호 앞 띄어쓰기
  for (let i = 1; i < source.length; i += 1) {
    if ((source[i - 1] === " " || source[i - 1] === "　") && PUNCT_AFTER_SPACE.has(source[i])) {
      issues.push({
        rule: "SPACE_BEFORE_PUNCT",
        severity: "warning",
        message: "문장부호 앞은 띄어 쓰지 않습니다.",
        start: i - 1,
        end: i + 1,
      });
    }
  }

  // 괄호·따옴표 짝
  const stack: { ch: string; index: number }[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const open = OPENERS.indexOf(ch);
    if (open >= 0) {
      stack.push({ ch, index: i });
      continue;
    }
    const close = CLOSERS.indexOf(ch);
    if (close >= 0) {
      const last = stack.pop();
      if (!last || OPENERS.indexOf(last.ch) !== close) {
        issues.push({
          rule: "BRACKET_UNBALANCED",
          severity: "warning",
          message: "여는 짝이 없는 괄호·따옴표입니다.",
          start: i,
          end: i + 1,
        });
      }
    }
  }
  for (const leftover of stack) {
    issues.push({
      rule: "BRACKET_UNBALANCED",
      severity: "warning",
      message: "닫는 짝이 없는 괄호·따옴표입니다.",
      start: leftover.index,
      end: leftover.index + 1,
    });
  }

  return issues;
}

/** 배치 과정에서 자동으로 손본 내용 — 고칠 필요는 없고 알려만 준다. */
function collectAutoNotes(layout: LayoutResult): RuleIssue[] {
  const byKind = {
    PUNCT_WRAPPED: 0,
    SPACE_AT_LINE_START: 0,
    SPACE_AFTER_PUNCT: 0,
    BRACKET_PUSHED: 0,
  };
  for (const note of layout.notes) {
    if (note.kind in byKind) byKind[note.kind as keyof typeof byKind] += 1;
  }

  const issues: RuleIssue[] = [];
  if (byKind.PUNCT_WRAPPED > 0) {
    issues.push({
      rule: "AUTO_PUNCT_WRAPPED",
      severity: "info",
      message: `문장부호 ${byKind.PUNCT_WRAPPED}곳을 앞 줄 마지막 칸에 함께 넣었습니다.`,
      start: 0,
      end: 0,
    });
  }
  if (byKind.SPACE_AT_LINE_START > 0) {
    issues.push({
      rule: "AUTO_SPACE_DROPPED",
      severity: "info",
      message: `줄 첫 칸에 온 띄어쓰기 ${byKind.SPACE_AT_LINE_START}곳은 칸을 쓰지 않았습니다.`,
      start: 0,
      end: 0,
    });
  }
  if (byKind.SPACE_AFTER_PUNCT > 0) {
    issues.push({
      rule: "AUTO_SPACE_AFTER_PUNCT",
      severity: "info",
      message: `마침표·쉼표 뒤 띄어쓰기 ${byKind.SPACE_AFTER_PUNCT}곳은 칸을 쓰지 않았습니다.`,
      start: 0,
      end: 0,
    });
  }
  if (byKind.BRACKET_PUSHED > 0) {
    issues.push({
      rule: "AUTO_BRACKET_PUSHED",
      severity: "info",
      message: `여는 괄호·따옴표 ${byKind.BRACKET_PUSHED}곳을 다음 줄로 내렸습니다.`,
      start: 0,
      end: 0,
    });
  }
  return issues;
}

export function checkManuscript(
  source: string,
  layout: LayoutResult,
  lengthRule: LengthRule | null,
): RuleIssue[] {
  return [
    ...checkLength(layout, lengthRule),
    ...checkText(source),
    ...collectAutoNotes(layout),
  ].sort((a, b) => a.start - b.start);
}
