import Link from "next/link";

/**
 * 관리 화면의 쪽 머리글.
 *
 * 화면 사이를 오가는 길과 로그인 정보는 겉틀(`AdminSidebar`)이 맡는다.
 * 여기는 "지금 보고 있는 화면이 무엇인가"만 적는다.
 */
export function AdminNav({
  title,
  description,
  back,
  action,
}: {
  /** 겉틀이 이미 보여 주므로 쓰지 않는다. 부르는 쪽을 고치지 않으려고 받아만 둔다. */
  user?: { displayName: string; email: string };
  title: string;
  description?: string;
  back?: { href: string; label: string };
  /** 오른쪽에 붙일 단추 — 이 화면에서 가장 자주 하는 일 */
  action?: React.ReactNode;
}) {
  return (
    <header className="border-b border-neutral-200 pb-4">
      {back ? (
        <Link
          href={back.href}
          className="inline-block text-sm text-neutral-500 underline-offset-4 hover:underline"
        >
          ← {back.label}
        </Link>
      ) : null}

      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
