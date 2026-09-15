"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { exchangeSession, homeFor, logout } from "@/lib/auth/client";
import { clientAuth } from "@/lib/firebase/client";
import type { BlockedReason } from "@/lib/types/user";

/** 선생님이 받아 줬는지 물어보는 주기. 기다리는 쪽이 지루하지 않을 만큼만. */
const POLL_MS = 10_000;

const COPY: Record<BlockedReason, { title: string; body: string }> = {
  pending: {
    title: "가입 신청을 보냈습니다",
    body: "선생님이 명단에서 확인하고 받아 주면 바로 쓸 수 있습니다. 이 화면을 열어 두면 승인되는 대로 넘어갑니다.",
  },
  rejected: {
    title: "가입이 받아들여지지 않았습니다",
    body: "이름이나 이메일을 잘못 적었을 수 있습니다. 선생님께 확인해 주세요.",
  },
  suspended: {
    title: "이용이 중지된 계정입니다",
    body: "선생님이 계정을 잠시 막아 두었습니다. 선생님께 문의해 주세요.",
  },
};

/**
 * 로그인은 됐지만 아직 쓸 수 없는 계정에게 보여 주는 화면.
 *
 * 그냥 로그인 화면으로 돌려보내면 학생은 "가입이 안 됐나" 싶어 같은 신청을 반복한다.
 * 여기서 무엇을 기다리는 중인지 말해 주고, 승인되면 스스로 넘어간다.
 */
export default function PendingPage() {
  const router = useRouter();
  const [reason, setReason] = useState<BlockedReason | null>(null);
  const [checking, setChecking] = useState(true);
  /** "지금 확인" 을 누르면 값이 바뀌어 effect 가 다시 돈다. */
  const [nudge, setNudge] = useState(0);

  /**
   * 선생님이 받아 줬는지 되묻는다.
   *
   * effect 는 타이머 하나만 쥐고, 상태는 응답이 온 **뒤에** 바꾼다 —
   * effect 본문에서 곧장 setState 하면 렌더가 꼬리를 물고 이어진다.
   */
  useEffect(() => {
    let alive = true;

    async function ask() {
      let data: { ok?: boolean; role?: string; reason?: BlockedReason } | null = null;
      try {
        data = await (await fetch("/api/auth/me")).json();
      } catch {
        // 잠깐 끊긴 것일 수 있다. 다음 차례에 다시 묻는다.
        return;
      }
      if (!alive || !data) return;

      if (data.ok) {
        // 받아들여지면서 역할 claim 이 생겼다. 그 claim 이 담긴 토큰으로 세션을 다시 받아야
        // 다음 화면이 우리를 알아본다.
        const user = clientAuth.currentUser;
        if (user) await exchangeSession(user, true);
        if (!alive) return;
        router.replace(homeFor(data.role ?? "student"));
        router.refresh();
        return;
      }
      if (!data.reason) {
        router.replace("/login");
        return;
      }
      setReason(data.reason);
      setChecking(false);
    }

    void ask();
    const timer = setInterval(() => void ask(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [router, nudge]);

  const copy = reason ? COPY[reason] : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <span
          className={[
            "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
            reason === "pending"
              ? "bg-amber-50 text-amber-700"
              : "bg-neutral-100 text-neutral-600",
          ].join(" ")}
        >
          {reason === "pending" ? "승인 대기" : reason === "rejected" ? "거절됨" : "중지됨"}
        </span>

        <h1 className="mt-3 text-xl font-bold">{copy?.title ?? "확인하는 중…"}</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{copy?.body ?? ""}</p>

        {reason === "pending" ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-neutral-400">
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                checking ? "bg-brand-500" : "bg-neutral-300",
              ].join(" ")}
            />
            {checking ? "확인하는 중…" : `${POLL_MS / 1000}초마다 확인합니다`}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setChecking(true);
            setNudge((value) => value + 1);
          }}
          disabled={checking}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          지금 확인
        </button>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          className="text-sm text-neutral-500 underline"
        >
          로그아웃
        </button>
      </div>
    </main>
  );
}
