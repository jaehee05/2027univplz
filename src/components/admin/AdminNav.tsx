import Link from "next/link";

import { LogoutButton } from "@/components/auth/LogoutButton";

const LINKS = [
  { href: "/admin", label: "관리 홈" },
  { href: "/admin/universities", label: "대학 · 기출" },
  { href: "/admin/students", label: "학생" },
  { href: "/admin/assignments", label: "과제 · 첨삭" },
  { href: "/admin/manuscript", label: "원고지" },
];

export function AdminNav({
  user,
  title,
  description,
  back,
}: {
  user: { displayName: string; email: string };
  title: string;
  description?: string;
  back?: { href: string; label: string };
}) {
  return (
    <header className="border-b border-neutral-200 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-3 text-sm text-neutral-500">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>
            {user.displayName} 선생님 · {user.email}
          </span>
          <LogoutButton />
        </div>
      </div>

      {back ? (
        <Link
          href={back.href}
          className="mt-4 inline-block text-sm text-neutral-500 underline-offset-4 hover:underline"
        >
          ← {back.label}
        </Link>
      ) : null}

      <h1 className="mt-3 text-2xl font-bold">{title}</h1>
      {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
    </header>
  );
}
