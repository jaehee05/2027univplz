import Link from "next/link";

import { AssignmentCard } from "@/components/student/AssignmentCard";
import { requireUser } from "@/lib/auth/dal";
import { groupWorkBy, listAssignmentsFor } from "@/lib/work/store";
import { questionProgress, studentStats } from "@/lib/work/summary";

function StatCard({
  value,
  unit,
  label,
  tone = "neutral",
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: "neutral" | "brand" | "up" | "down";
}) {
  const color =
    tone === "brand"
      ? "text-brand-600"
      : tone === "up"
        ? "text-emerald-600"
        : tone === "down"
          ? "text-rose-600"
          : "text-neutral-900";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
      <p className="flex items-baseline justify-center gap-0.5">
        <span className={`text-2xl font-bold tabular-nums sm:text-3xl ${color}`}>{value}</span>
        {unit ? <span className="text-sm text-neutral-400">{unit}</span> : null}
      </p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [assignments, work] = await Promise.all([
    listAssignmentsFor("studentId", user.uid),
    groupWorkBy("studentId", user.uid),
  ]);

  const stats = studentStats(assignments, work.corrections);

  const todo = assignments.filter(
    (row) => row.status === "assigned" || row.status === "writing",
  );
  const waiting = assignments.filter(
    (row) => row.status === "submitted" || row.status === "correcting" || row.status === "corrected",
  );
  const recent = assignments.filter((row) => row.status === "published").slice(0, 2);

  return (
    <main className="pb-tabbar mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
      <h1 className="text-xl font-bold sm:text-2xl">
        안녕하세요, {user.displayName}님
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {todo.length > 0
          ? `해야 할 과제가 ${todo.length}개 있습니다.`
          : waiting.length > 0
            ? "낸 답안을 선생님이 보고 있습니다."
            : "지금 해야 할 과제는 없습니다."}
      </p>

      <section className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3">
        <StatCard
          value={stats.average == null ? "—" : String(stats.average)}
          unit={stats.average == null ? undefined : "점"}
          label="문항 평균"
          tone="brand"
        />
        <StatCard value={String(stats.gradedCount)} unit="편" label="첨삭받은 답안" />
        <StatCard
          value={
            stats.delta == null ? "—" : `${stats.delta > 0 ? "↑" : stats.delta < 0 ? "↓" : ""}${Math.abs(stats.delta)}`
          }
          unit={stats.delta == null ? undefined : "점"}
          label="지난 시험지 대비"
          tone={stats.delta == null ? "neutral" : stats.delta > 0 ? "up" : stats.delta < 0 ? "down" : "neutral"}
        />
      </section>

      {assignments.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          아직 받은 과제가 없습니다.
          <br />
          선생님이 시험지를 내주면 여기에 나타납니다.
        </p>
      ) : null}

      {[
        { title: "해야 할 과제", rows: todo },
        { title: "첨삭 기다리는 중", rows: waiting },
        { title: "최근 첨삭 결과", rows: recent, more: true },
      ].map((group) =>
        group.rows.length > 0 ? (
          <section key={group.title} className="mt-8">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-bold">
                {group.title}
                <span className="ml-2 text-sm font-normal text-neutral-400 tabular-nums">
                  {group.rows.length}
                </span>
              </h2>
              {group.more ? (
                <Link
                  href="/history"
                  className="text-sm text-neutral-500 underline-offset-4 hover:underline"
                >
                  전체 보기
                </Link>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {group.rows.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  progress={questionProgress(assignment, work.answers.get(assignment.id) ?? [])}
                  corrections={work.corrections.get(assignment.id) ?? []}
                />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </main>
  );
}
