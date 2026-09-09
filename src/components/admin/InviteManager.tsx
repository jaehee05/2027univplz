"use client";

import { useEffect, useState } from "react";

interface Invite {
  code: string;
  role: string;
  label: string | null;
  usedBy: string | null;
  expiresAt: string | null;
}

export function InviteManager() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/invites");
    if (!response.ok) return;
    const data = await response.json();
    setInvites(data.invites ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || undefined, role: "student", validDays: 30 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "발급에 실패했습니다.");
      setLabel("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "발급에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="학생 이름(메모용)"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void issue()}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "발급 중…" : "코드 발급"}
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {invites.length > 0 ? (
        <ul className="mt-4 divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {invites.map((invite) => (
            <li key={invite.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-mono tracking-widest">{invite.code}</span>
              <span className="text-neutral-500">
                {invite.label ?? "—"}
                {invite.usedBy ? " · 사용됨" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">발급한 코드가 없습니다.</p>
      )}
    </div>
  );
}
