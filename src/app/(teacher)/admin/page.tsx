import Link from "next/link";

import { requireTeacher } from "@/lib/auth/dal";
import { AdminNav } from "@/components/admin/AdminNav";
import { InviteManager } from "@/components/admin/InviteManager";
import { listUniversities } from "@/lib/exam/store";
import { listInvites } from "@/lib/invites/store";
import { listAssignmentsFor, listStudents } from "@/lib/work/store";

export default async function AdminPage() {
  const user = await requireTeacher();
  const [invites, students, assignments, universities] = await Promise.all([
    listInvites(user.uid),
    listStudents(user.uid),
    listAssignmentsFor("assignedBy", user.uid),
    listUniversities(),
  ]);

  const waiting = assignments.filter((row) => row.status === "submitted").length;
  const toPublish = assignments.filter((row) => row.status === "corrected").length;

  const cards = [
    { href: "/admin/universities", label: "등록된 대학", value: universities.length },
    { href: "/admin/students", label: "학생", value: students.filter((s) => s.active).length },
    { href: "/admin/assignments", label: "첨삭 대기", value: waiting, alert: waiting > 0 },
    { href: "/admin/assignments", label: "공개 대기", value: toPublish, alert: toPublish > 0 },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav user={user} title="관리 화면" />

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={[
              "rounded-lg border p-4 transition hover:border-neutral-400",
              card.alert ? "border-amber-300 bg-amber-50" : "border-neutral-200",
            ].join(" ")}
          >
            <p className="text-xs text-neutral-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold">{card.value}</p>
          </Link>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">학생 초대</h2>
        <p className="mt-1 text-sm text-neutral-500">
          코드를 발급해 학생에게 전달하면, 학생이 가입 화면에서 입력해 계정을 만듭니다.
        </p>
        <InviteManager initial={invites} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">시작하는 순서</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-600">
          <li>
            <Link href="/admin/universities" className="underline underline-offset-4">
              대학 · 기출
            </Link>{" "}
            에서 기출 PDF 를 올리면 연도 · 인문/자연 · 문제/해설을 알아서 나눕니다.
          </li>
          <li>문항을 확인해 저장하고, 채점 기준을 분석한 뒤 <b>확정</b>합니다.</li>
          <li>같은 화면 아래에서 문항을 골라 학생에게 내줍니다.</li>
          <li>
            학생이 제출하면{" "}
            <Link href="/admin/assignments" className="underline underline-offset-4">
              과제 · 첨삭
            </Link>{" "}
            에서 첨삭을 돌리고, 확인한 뒤 공개합니다.
          </li>
        </ol>
      </section>
    </main>
  );
}
