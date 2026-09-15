import type { Metadata } from "next";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireUser } from "@/lib/auth/dal";
import { groupWorkBy, listAssignmentsFor } from "@/lib/work/store";
import { studentStats } from "@/lib/work/summary";

export const metadata: Metadata = { title: "내 정보" };

export default async function MePage() {
  const user = await requireUser();
  const [assignments, work] = await Promise.all([
    listAssignmentsFor("studentId", user.uid),
    groupWorkBy("studentId", user.uid),
  ]);
  const stats = studentStats(assignments, work.corrections);

  const rows = [
    { label: "이름", value: user.displayName },
    { label: "이메일", value: user.email },
    { label: "받은 시험지", value: `${assignments.length}장` },
    { label: "첨삭받은 답안", value: `${stats.gradedCount}편` },
    { label: "문항 평균", value: stats.average == null ? "—" : `${stats.average}점` },
  ];

  return (
    <main className="pb-tabbar mx-auto w-full max-w-lg px-4 pt-6 sm:px-6">
      <h1 className="text-xl font-bold sm:text-2xl">내 정보</h1>

      <section className="mt-5 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <dl className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 px-4 py-3.5">
              <dt className="text-sm text-neutral-500">{row.label}</dt>
              <dd className="min-w-0 truncate font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-5">
        <LogoutButton />
      </div>
    </main>
  );
}
