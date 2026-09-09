"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { UserCredential } from "firebase/auth";

import {
  authErrorMessage,
  emailSignUp,
  exchangeSession,
  googleSignIn,
  homeFor,
} from "@/lib/auth/client";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(credential: UserCredential) {
    const idToken = await credential.user.getIdToken();
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        displayName: displayName || credential.user.displayName || "이름 없음",
        inviteCode: inviteCode || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "가입에 실패했습니다.");

    // 역할(custom claim)이 담긴 토큰으로 세션을 다시 발급받는다.
    await exchangeSession(credential, true);

    router.replace(homeFor(data.role));
    router.refresh();
  }

  async function run(action: () => Promise<UserCredential>) {
    setBusy(true);
    setError(null);
    try {
      await finish(await action());
    } catch (caught) {
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <header>
        <h1 className="text-2xl font-bold">가입</h1>
        <p className="mt-1 text-sm text-neutral-500">
          첫 계정은 선생님 계정이 됩니다. 학생은 선생님이 발급한 초대 코드가 필요합니다.
        </p>
      </header>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => emailSignUp(email, password));
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          이름
          <input
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          비밀번호
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          초대 코드 <span className="text-neutral-400">(학생만 입력)</span>
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-base tracking-widest"
            placeholder="ABCD2345"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {busy ? "처리 중…" : "가입하기"}
        </button>
      </form>

      <button
        type="button"
        disabled={busy}
        onClick={() => void run(googleSignIn)}
        className="rounded-md border border-neutral-300 px-4 py-2.5 font-medium disabled:opacity-50"
      >
        구글 계정으로 가입
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <p className="text-center text-sm text-neutral-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
