"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "홈" },
  { href: "/history", label: "첨삭 결과" },
  { href: "/me", label: "내 정보" },
];

/**
 * 넓은 화면에서 쓰는 위 머리글. 좁아지면 아래 탭바가 같은 일을 하므로 링크만 숨는다.
 * 작성 화면은 제 머리글을 따로 쓰므로 통째로 빠진다.
 */
export function StudentHeader({ name }: { name: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/write/")) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="font-bold tracking-tight">
          <span className="text-brand-600">KJH</span>EDU
        </Link>

        <nav className="ml-4 hidden gap-1 text-sm md:flex">
          {LINKS.map((link) => {
            const on = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={on ? "page" : undefined}
                className={[
                  "rounded-lg px-3 py-1.5 transition",
                  on
                    ? "bg-brand-50 font-medium text-brand-700"
                    : "text-neutral-500 hover:bg-neutral-100",
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <span className="ml-auto truncate text-sm text-neutral-500">{name}</span>
      </div>
    </header>
  );
}
