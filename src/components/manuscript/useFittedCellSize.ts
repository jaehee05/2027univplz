"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** 칸 크기 한도 — 이보다 작아지면 글자가 안 읽혀서 가로 스크롤로 넘긴다. */
export const MIN_CELL = 15;
export const MAX_CELL = 22;
/** 오른쪽 눈금과 좌우 안쪽 여백 */
const TICK_GUTTER = 60;

/**
 * 원고지 칸 크기를 남는 폭에 맞춘다.
 * 옆에 문제지나 코멘트 목록을 두면 원고지가 폭을 고정으로 차지해 상대 칸이 좁아진다.
 * 좁으면 칸을 줄이고, 넓으면 원래 크기로 돌아가며, 더 줄일 수 없으면 가로로 스크롤한다.
 */
export function useFittedCellSize(ref: RefObject<HTMLElement | null>, cols: number): number {
  const [cellSize, setCellSize] = useState(MAX_CELL);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const usable = node.clientWidth - TICK_GUTTER;
      const fitted = Math.floor(usable / cols);
      setCellSize(Math.max(MIN_CELL, Math.min(MAX_CELL, fitted)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [cols, ref]);

  return cellSize;
}
