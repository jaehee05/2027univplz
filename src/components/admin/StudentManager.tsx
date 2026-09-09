"use client";

import { useState } from "react";

import type { StudentRow } from "@/lib/types/work";

export function StudentManager({ initial }: { initial: StudentRow[] }) {
  const [students, setStudents] = useState<StudentRow[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(uid: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/students/${uid}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
      setStudents(data.students ?? []);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "처리에 실패했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(student: StudentRow) {
    if (
      !confirm(
        `${student.displayName} 학생을 삭제할까요?\n계정과 내준 과제 ${student.assignmentCount}건이 함께 지워지고 되돌릴 수 없습니다.\n\n잠시 막아 두려면 '중지'를 쓰세요.`,
      )
    ) {
      return;
    }
    await send(student.uid, "DELETE");
  }

  if (students.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
        아직 학생이 없습니다. 관리 홈에서 초대 코드를 발급해 학생에게 전달하세요.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {students.map((student) => (
          <li key={student.uid} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            {editing === student.uid ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  className="w-40 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!name.trim()) {
                      setError("이름을 넣어 주세요.");
                      return;
                    }
                    if (await send(student.uid, "PATCH", { displayName: name.trim() })) {
                      setEditing(null);
                    }
                  }}
                  disabled={busy}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                >
                  취소
                </button>
              </div>
            ) : (
              <>
                <div>
                  <span className="font-medium">{student.displayName}</span>
                  <span className="ml-2 text-xs text-neutral-400">{student.email}</span>
                  {!student.active ? (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      중지됨
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  <span>
                    과제 {student.assignmentCount} · 제출 {student.submittedCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(student.uid);
                      setName(student.displayName);
                    }}
                    className="rounded border border-neutral-300 px-2 py-1"
                  >
                    이름 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => void send(student.uid, "PATCH", { active: !student.active })}
                    disabled={busy}
                    className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-50"
                    title={
                      student.active
                        ? "바로 로그아웃되고 다시 로그인할 수 없게 됩니다."
                        : "다시 로그인할 수 있게 됩니다."
                    }
                  >
                    {student.active ? "중지" : "재개"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(student)}
                    disabled={busy}
                    className="rounded border border-red-200 px-2 py-1 text-red-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
