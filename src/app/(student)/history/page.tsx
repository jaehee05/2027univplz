import type { Metadata } from "next";

import { AssignmentCard } from "@/components/student/AssignmentCard";
import { requireUser } from "@/lib/auth/dal";
import { groupWorkBy, listAssignmentsFor } from "@/lib/work/store";
import { questionProgress } from "@/lib/work/summary";

export const metadata: Metadata = { title: "첨삭 결과" };

/** 지난 과제 전부. 공개된 첨삭은 점수까지 카드에 얹힌다. */
export default async function HistoryPage() {
  const user = await requireUser();
  const [assignments, work] = await Promise.all([
    listAssignmentsFor("studentId", user.uid),
    groupWorkBy("studentId", user.uid),
  ]);

  const past = assignments.filter(
    (row) => row.status !== "assigned" && row.status !== "writing",
  );

  return (
    <main className="pb-tabbar mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
      <h1 className="text-xl font-bold sm:text-2xl">첨삭 결과</h1>
      <p className="mt-1 text-sm text-neutral-500">
        낸 시험지와 받은 첨삭입니다. 채점은 문항마다 100점이라 점수를 합치지 않습니다.
      </p>

      {past.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          아직 낸 시험지가 없습니다.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {past.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              progress={questionProgress(assignment, work.answers.get(assignment.id) ?? [])}
              corrections={work.corrections.get(assignment.id) ?? []}
            />
          ))}
        </div>
      )}
    </main>
  );
}
