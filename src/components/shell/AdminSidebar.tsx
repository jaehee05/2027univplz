"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoutButton } from "@/components/auth/LogoutButton";

const LINKS = [
  { href: "/admin", label: "관리 홈", exact: true, path: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" },
  {
    href: "/admin/universities",
    label: "대학 · 기출",
    path: "M12 4 3 8.5l9 4.5 9-4.5L12 4ZM6.5 11v5.5c0 1.1 2.5 2.5 5.5 2.5s5.5-1.4 5.5-2.5V11",
  },
  {
    href: "/admin/intake",
    label: "기출 올리기",
    path: "M12 16V4m0 0L8 8m4-4 4 4M4 16v3h16v-3",
  },
  {
    href: "/admin/students",
    label: "학생",
    badge: "waitingStudents" as const,
    path: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 11.5a5.5 5.5 0 0 1 5.5 5.5",
  },
  {
    href: "/admin/assignments",
    label: "과제 · 첨삭",
    badge: "pending" as const,
    path: "M6 3h8l4 4v14H6zM14 3v4h4M9 13.5l2 2 4-4",
  },
  {
    href: "/admin/manuscript",
    label: "원고지",
    path: "M4 4h16v16H4zM4 9.5h16M4 15h16M9.5 4v16M15 4v16",
  },
];

export interface AdminCounts {
  /** 첨삭·공개를 기다리는 시험지 수 — 목록 옆에 붙는다 */
  pending: number;
  /** 받아 주기를 기다리는 가입 신청 수 */
  waitingStudents: number;
}

export function AdminSidebar({
  user,
  counts,
}: {
  user: { displayName: string; email: string };
  counts: AdminCounts;
}) {
  const pathname = usePathname();
  /**
   * 서랍을 연 화면의 주소를 쥔다. 화면을 옮기면 주소가 달라져 저절로 닫힌다 —
   * 상태를 되돌리는 effect 없이 렌더에서 유도한다.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (value: boolean) => setOpenedAt(value ? pathname : null);

  const items = LINKS.map((link) => ({
    ...link,
    on: link.exact ? pathname === link.href : pathname.startsWith(link.href),
    count:
      link.badge === "pending"
        ? counts.pending
        : link.badge === "waitingStudents"
          ? counts.waitingStudents
          : 0,
  }));

  const nav = (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            aria-current={item.on ? "page" : undefined}
            className={[
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition",
              item.on
                ? "bg-brand-50 font-semibold text-brand-700"
                : "text-neutral-600 hover:bg-neutral-100",
            ].join(" ")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden
            >
              <path d={item.path} />
            </svg>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.count > 0 ? (
              <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
                {item.count}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* 좁은 화면 — 위 막대와 서랍 */}
      <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur lg:hidden print:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="메뉴"
            className="rounded-lg p-1.5 hover:bg-neutral-100"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              aria-hidden
            >
              {open ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
          <span className="font-bold tracking-tight">
            논술 <span className="text-brand-600">첨삭</span>
            <span className="ml-1.5 text-xs font-normal text-neutral-400">관리</span>
          </span>
          {counts.pending + counts.waitingStudents > 0 ? (
            <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
              {counts.pending + counts.waitingStudents}
            </span>
          ) : null}
        </div>

        {open ? (
          <div className="border-t border-neutral-200 p-3">
            {nav}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-200 px-3 pt-3 text-sm text-neutral-500">
              <span className="truncate">{user.displayName} 선생님</span>
              <LogoutButton />
            </div>
          </div>
        ) : null}
      </div>

      {/* 넓은 화면 — 왼쪽 고정 기둥 */}
      <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white lg:flex lg:h-dvh lg:flex-col lg:sticky lg:top-0 print:hidden">
        <div className="px-5 py-5 font-bold tracking-tight">
          논술 <span className="text-brand-600">첨삭</span>
          <span className="ml-1.5 text-xs font-normal text-neutral-400">관리</span>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3">{nav}</nav>

        <div className="border-t border-neutral-200 px-5 py-4 text-sm">
          <p className="truncate font-medium">{user.displayName} 선생님</p>
          <p className="truncate text-xs text-neutral-400">{user.email}</p>
          <div className="mt-2">
            <LogoutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
