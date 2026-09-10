"use client";

import { useEffect } from "react";

/**
 * 인쇄 화면의 공통 껍데기.
 * 화면에서는 제목 줄과 인쇄 버튼을 보여 주고, 종이에서는 그 줄을 감춘다.
 */
export function PrintFrame({
  title,
  subtitle,
  auto = false,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** 열자마자 인쇄 대화상자를 띄울지 */
  auto?: boolean;
  /** 가로로 인쇄하는 화면 — 미리보기 폭을 가로 A4 에 맞춘다 */
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!auto) return;
    // 글꼴·격자가 자리를 잡은 뒤에 띄운다.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [auto]);

  return (
    <main
      className={[
        "mx-auto w-full bg-white px-6 py-8 print:px-0 print:py-0",
        wide ? "max-w-[297mm]" : "max-w-[210mm]",
      ].join(" ")}
    >
      <div className="mb-6 flex items-center justify-between gap-3 border-b border-neutral-200 pb-3 print:hidden">
        <div>
          <h1 className="font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-neutral-500">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {wide ? (
            <span className="text-xs text-neutral-500">
              가로(A4 landscape)로 나갑니다. 인쇄 창에서 용지 방향이 가로인지 확인해 주세요.
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            인쇄
          </button>
        </div>
      </div>

      {children}
    </main>
  );
}
