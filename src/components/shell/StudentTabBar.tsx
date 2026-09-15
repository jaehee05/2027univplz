"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/dashboard",
    label: "홈",
    // 집
    path: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  },
  {
    href: "/history",
    label: "첨삭",
    // 문서에 체크
    path: "M6 3h8l4 4v14H6zM14 3v4h4M9 13.5l2 2 4-4",
  },
  {
    href: "/me",
    label: "내 정보",
    // 사람
    path: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0",
  },
];

/**
 * 좁은 화면에서 쓰는 아래 탭바. 넓어지면 위 머리글의 링크가 같은 일을 하므로 사라진다.
 *
 * 답안 작성 화면(`/write`)은 문제지와 원고지가 화면을 꽉 채우는 자리라 탭바를 걷어낸다 —
 * 시험 보는 동안 다른 데로 새지 않게 하려는 뜻도 있다.
 */
export function StudentTabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/write/")) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur md:hidden print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={[
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition",
                  on ? "text-brand-600" : "text-neutral-400",
                ].join(" ")}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={on ? 2.1 : 1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={tab.path} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
