import { requireUser } from "@/lib/auth/dal";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold">내 과제</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {user.displayName} · {user.email}
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-10 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">
        배정된 문항이 아직 없습니다. 원고지 답안 작성은 다음 단계에서 추가됩니다.
      </section>
    </main>
  );
}
