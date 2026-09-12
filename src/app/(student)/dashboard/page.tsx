import Link from "next/link";

import { requireUser } from "@/lib/auth/dal";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ASSIGNMENT_LABEL, type Assignment, type Answer } from "@/lib/types/work";
import { groupWorkBy, listAssignmentsFor } from "@/lib/work/store";

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  const due = new Date(iso);
  const days = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const date = due.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  if (days < 0) return `${date} 마감 지남`;
  if (days === 0) return `${date} 오늘까지`;
  return `${date}까지 · ${days}일 남음`;
}

/** 학생이 지금 무엇을 해야 하는지 한 줄로 */
function action(assignment: Assignment) {
  switch (assignment.status) {
    case "assigned":
      return { href: `/write/${assignment.id}`, label: "답안 쓰기", primary: true };
    case "writing":
      return { href: `/write/${assignment.id}`, label: "이어 쓰기", primary: true };
    case "published":
      return { href: `/results/${assignment.id}`, label: "첨삭 결과 보기", primary: true };
    default:
      return { href: `/write/${assignment.id}`, label: "내 답안 보기", primary: false };
  }
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [assignments, work] = await Promise.all([
    listAssignmentsFor("studentId", user.uid),
    groupWorkBy("studentId", user.uid),
  ]);

  const todo = assignments.filter(
    (row) => row.status === "assigned" || row.status === "writing",
  );
  const done = assignments.filter((row) => !todo.includes(row));

  /** 문항마다 얼마나 썼는지 — 시험지는 문항을 다 써야 낼 수 있다. */
  function progress(assignment: Assignment): { number: string; answer: Answer | null }[] {
    const rows = work.answers.get(assignment.id) ?? [];
    return assignment.questions.map((question) => ({
      number: question.number,
      answer: rows.find((row) => row.questionId === question.questionId) ?? null,
    }));
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold">내 과제</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {user.displayName} · {user.email}
          </p>
        </div>
        <LogoutButton />
      </header>

      {assignments.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          아직 받은 과제가 없습니다. 선생님이 시험지를 내주면 여기에 나타납니다.
        </p>
      ) : null}

      {[
        { title: "해야 할 것", rows: todo },
        { title: "지난 과제", rows: done },
      ].map((group) =>
        group.rows.length > 0 ? (
          <section key={group.title} className="mt-8">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <ul className="mt-3 space-y-3">
              {group.rows.map((row) => {
                const next = action(row);
                const due = formatDue(row.dueAt);
                const items = progress(row);
                return (
                  <li
                    key={row.id}
                    className="rounded-lg border border-neutral-200 p-4 transition hover:border-neutral-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-neutral-500">{row.univName}</p>
                        <p className="mt-0.5 font-medium">
                          {row.examTitle}
                          <span className="ml-2 text-sm font-normal text-neutral-500">
                            문항 {row.questions.length}개
                          </span>
                        </p>

                        {/* 문항마다 얼마나 썼는지 — 시험지는 문항을 다 써야 낸다. */}
                        <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                          {items.map((item, index) => {
                            const count = item.answer?.charCount ?? 0;
                            const target = row.questions[index]?.charTarget;
                            return (
                              <li key={item.number} className="flex items-baseline gap-2">
                                <span className="w-10 shrink-0 font-medium">{item.number}번</span>
                                <span className="text-neutral-500">
                                  {target ? `${target}자 내외` : "분량 조건 없음"}
                                </span>
                                <span
                                  className={
                                    item.answer?.status === "submitted"
                                      ? "text-emerald-700"
                                      : count > 0
                                        ? "text-sky-700"
                                        : "text-neutral-400"
                                  }
                                >
                                  {item.answer?.status === "submitted"
                                    ? `제출 ${count}자`
                                    : count > 0
                                      ? `쓰는 중 ${count}자`
                                      : "시작 전"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-xs text-neutral-500">
                          {ASSIGNMENT_LABEL[row.status]}
                        </span>
                        {due ? (
                          <span
                            className={
                              due.includes("지남")
                                ? "text-xs text-red-600"
                                : "text-xs text-neutral-500"
                            }
                          >
                            {due}
                          </span>
                        ) : null}
                        <Link
                          href={next.href}
                          className={[
                            "rounded-md px-4 py-2 text-sm font-medium",
                            next.primary
                              ? "bg-neutral-900 text-white"
                              : "border border-neutral-300",
                          ].join(" ")}
                        >
                          {next.label}
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
    </main>
  );
}
