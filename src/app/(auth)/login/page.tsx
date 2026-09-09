"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { User, UserCredential } from "firebase/auth";

import {
  authErrorMessage,
  emailSignIn,
  exchangeSession,
  googleSignIn,
  homeFor,
} from "@/lib/auth/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(user: User) {
    const response = await exchangeSession(user);
    const data = await response.json().catch(() => ({}));

    if (response.status === 409 && data.code === "NOT_REGISTERED") {
      // Firebase 계정만 있고 서비스 등록 전 → 가입 화면으로
      router.replace("/signup");
      return;
    }
    if (!response.ok) throw new Error(data.error ?? "로그인에 실패했습니다.");

    router.replace(homeFor(data.role));
    router.refresh();
  }

  async function run(action: () => Promise<UserCredential>) {
    setBusy(true);
    setError(null);
    try {
      const credential = await action();
      await finish(credential.user);
    } catch (caught) {
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <header>
        <h1 className="text-2xl font-bold">인문 논술 첨삭</h1>
        <p className="mt-1 text-sm text-neutral-500">로그인 후 이용할 수 있습니다.</p>
      </header>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => emailSignIn(email, password));
        }}
      >
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {busy ? "확인 중…" : "로그인"}
        </button>
      </form>

      <button
        type="button"
        disabled={busy}
        onClick={() => void run(googleSignIn)}
        className="rounded-md border border-neutral-300 px-4 py-2.5 font-medium disabled:opacity-50"
      >
        구글 계정으로 로그인
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <p className="text-center text-sm text-neutral-500">
        처음이신가요?{" "}
        <Link href="/signup" className="underline">
          가입하기
        </Link>
      </p>
    </main>
  );
}
