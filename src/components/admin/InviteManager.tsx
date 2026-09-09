"use client";

import { useEffect, useState } from "react";

interface Invite {
  code: string;
  role: string;
  label: string | null;
  usedBy: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export function InviteManager() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  async function revoke(invite: Invite) {
    const warning = invite.usedBy
      ? `${invite.code} 는 이미 사용된 코드입니다. 파기해도 그 코드로 가입한 학생 계정은 그대로 남습니다. 파기할까요?`
      : `${invite.code} 를 파기할까요? 이 코드로는 더 이상 가입할 수 없습니다.`;
    if (!window.confirm(warning)) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/invites/${invite.code}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "파기에 실패했습니다.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "파기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("복사에 실패했습니다. 코드를 직접 선택해 복사해 주세요.");
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
          {busy ? "처리 중…" : "코드 발급"}
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {invites.length > 0 ? (
        <ul className="mt-4 divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {invites.map((invite) => (
            <li key={invite.code} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono tracking-widest">{invite.code}</span>
              <span className="text-neutral-500">{invite.label ?? "—"}</span>
              <span className={invite.usedBy ? "text-emerald-600" : "text-neutral-400"}>
                {invite.usedBy ? "사용됨" : `${formatDate(invite.expiresAt)}까지`}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => void copy(invite.code)}
                  className="text-neutral-500 underline"
                >
                  {copied === invite.code ? "복사됨" : "복사"}
                </button>
                <button
                  type="button"
                  onClick={() => void revoke(invite)}
                  disabled={busy}
                  className="text-red-600 underline disabled:opacity-50"
                >
                  파기
                </button>
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
