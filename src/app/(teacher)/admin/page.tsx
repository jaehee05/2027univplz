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
  const writing = assignments.filter(
    (row) => row.status === "assigned" || row.status === "writing",
  ).length;

  const cards = [
    {
      href: "/admin/assignments",
      label: "첨삭 대기",
      value: waiting,
      hint: "학생이 냈습니다",
      alert: waiting > 0,
    },
    {
      href: "/admin/assignments",
      label: "공개 대기",
      value: toPublish,
      hint: "확인하고 공개하세요",
      alert: toPublish > 0,
    },
    { href: "/admin/assignments", label: "쓰는 중", value: writing, hint: "아직 학생 차례" },
    {
      href: "/admin/students",
      label: "학생",
      value: students.filter((s) => s.active).length,
      hint: `대학 ${universities.length}곳 등록`,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <AdminNav
        title="관리 화면"
        description="밀린 일부터 처리하고, 새 기출은 왼쪽 ‘기출 올리기’에서 넣습니다."
      />

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={[
              "rounded-2xl border p-4 transition hover:border-neutral-400",
              card.alert
                ? "border-amber-300 bg-amber-50"
                : "border-neutral-200 bg-white",
            ].join(" ")}
          >
            <p className="text-xs text-neutral-500">{card.label}</p>
            <p
              className={[
                "mt-1 text-3xl font-bold tabular-nums",
                card.alert ? "text-amber-700" : "",
              ].join(" ")}
            >
              {card.value}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">{card.hint}</p>
          </Link>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="font-bold">학생 초대</h2>
        <p className="mt-1 text-sm text-neutral-500">
          코드를 발급해 학생에게 전달하면, 학생이 가입 화면에서 입력해 계정을 만듭니다.
        </p>
        <InviteManager initial={invites} />
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="font-bold">시작하는 순서</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-neutral-600">
          <li>
            <Link href="/admin/intake" className="underline underline-offset-4">
              기출 올리기
            </Link>
            에서 PDF 를 넣으면 대학 · 연도 · 인문/자연 · 문제/해설을 알아서 나눕니다.
          </li>
          <li>
            문항을 확인해 저장하고, 채점 기준을 분석한 뒤 <b>확정</b>합니다.
          </li>
          <li>같은 화면 아래에서 문항을 골라 학생에게 내줍니다.</li>
          <li>
            학생이 제출하면{" "}
            <Link href="/admin/assignments" className="underline underline-offset-4">
              과제 · 첨삭
            </Link>
            에서 첨삭을 돌리고, 확인한 뒤 공개합니다.
          </li>
        </ol>
      </section>
    </main>
  );
}
