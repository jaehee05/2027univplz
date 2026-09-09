"use client";

import Link from "next/link";
import { useState } from "react";

import type { University } from "@/lib/types/exam";

export function UniversityManager({ initial }: { initial: University[] }) {
  const [list, setList] = useState<University[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: unknown, url = "/api/universities", method = "POST") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
      if (data.universities) setList(data.universities);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "처리에 실패했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!name.trim() || !slug.trim()) {
      setError("대학 이름과 영문 약칭을 모두 입력하세요.");
      return;
    }
    if (await send({ name: name.trim(), slug: slug.trim().toLowerCase() })) {
      setName("");
      setSlug("");
    }
  }

  async function rename(univId: string) {
    if (!editName.trim()) {
      setError("대학 이름을 넣어 주세요.");
      return;
    }
    if (await send({ name: editName.trim() }, `/api/universities/${univId}`, "PATCH")) {
      setEditing(null);
    }
  }

  async function remove(univ: University) {
    if (!confirm(`${univ.name} 를 삭제할까요? 등록된 기출이 있으면 삭제되지 않습니다.`)) return;
    await send({}, `/api/universities/${univ.id}`, "DELETE");
  }

  return (
    <div className="mt-4">
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center">
          <p className="text-sm text-neutral-600">등록된 대학이 없습니다.</p>
          <button
            type="button"
            onClick={() => void send({ seedDefaults: true })}
            disabled={busy}
            className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            기본 6개 대학 넣기 (홍익·단국·건국·동국·국민·아주)
          </button>
        </div>
      ) : null}

      {list.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {list.map((univ) => (
            <li key={univ.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              {editing === univ.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename(univ.id);
                      if (event.key === "Escape") setEditing(null);
                    }}
                    autoFocus
                    className="w-40 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                  />
                  <span className="text-xs text-neutral-400">
                    약칭 {univ.slug} 은 주소에 쓰여서 바꿀 수 없습니다
                  </span>
                  <button
                    type="button"
                    onClick={() => void rename(univ.id)}
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
                    <Link
                      href={`/admin/universities/${univ.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {univ.name}
                    </Link>
                    <span className="ml-2 text-xs text-neutral-400">{univ.slug}</span>
                    {!univ.active ? (
                      <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                        비활성
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(univ.id);
                        setEditName(univ.name);
                      }}
                      className="rounded-md border border-neutral-300 px-3 py-1.5"
                    >
                      이름 수정
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void send({ active: !univ.active }, `/api/universities/${univ.id}`, "PATCH")
                      }
                      disabled={busy}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 disabled:opacity-50"
                    >
                      {univ.active ? "비활성화" : "활성화"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(univ)}
                      disabled={busy}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-red-600 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">대학 이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="서강대"
            className="mt-1 w-36 rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">영문 약칭 (주소에 쓰임)</span>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="sogang"
            className="mt-1 w-40 rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          대학 추가
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
