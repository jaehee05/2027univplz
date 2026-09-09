import Link from "next/link";

import { requireTeacher } from "@/lib/auth/dal";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { InviteManager } from "@/components/admin/InviteManager";
import { listInvites } from "@/lib/invites/store";

export default async function AdminPage() {
  const user = await requireTeacher();
  const invites = await listInvites(user.uid);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold">관리 화면</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {user.displayName} 선생님 · {user.email}
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">학생 초대</h2>
        <p className="mt-1 text-sm text-neutral-500">
          코드를 발급해 학생에게 전달하면, 학생이 가입 화면에서 입력해 계정을 만듭니다.
        </p>
        <InviteManager initial={invites} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">원고지</h2>
        <p className="mt-1 text-sm text-neutral-500">
          답안지 규격과 작성법 검사를 확인합니다.
        </p>
        <Link
          href="/admin/manuscript"
          className="mt-3 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          원고지 확인 화면 열기
        </Link>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">대학 · 기출 · 채점 기준</h2>
        <p className="mt-1 text-sm text-neutral-500">
          대학을 등록하고 기출 PDF 를 올려 대학별 채점 기준을 만듭니다.
        </p>
        <Link
          href="/admin/universities"
          className="mt-3 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          대학 관리 열기
        </Link>
      </section>

      <section className="mt-10 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">
        첨삭 · 인쇄는 다음 단계에서 추가됩니다.
      </section>
    </main>
  );
}
