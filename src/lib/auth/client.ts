"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type UserCredential,
} from "firebase/auth";

import { clientAuth, googleProvider } from "@/lib/firebase/client";

/** Firebase 인증 오류 코드를 사람이 읽을 문장으로 바꾼다. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const table: Record<string, string> = {
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/user-not-found": "등록되지 않은 이메일입니다.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인해 주세요.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
    "auth/popup-closed-by-user": "구글 로그인 창이 닫혔습니다.",
    "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  };
  if (table[code]) return table[code];
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

export const emailSignIn = (email: string, password: string) =>
  signInWithEmailAndPassword(clientAuth, email, password);

export const emailSignUp = (email: string, password: string) =>
  createUserWithEmailAndPassword(clientAuth, email, password);

export const googleSignIn = () => signInWithPopup(clientAuth, googleProvider);

/** 세션 쿠키 발급. forceRefresh 를 주면 최신 custom claim 이 담긴 토큰으로 만든다. */
export async function exchangeSession(
  credential: UserCredential,
  forceRefresh = false,
): Promise<Response> {
  const idToken = await credential.user.getIdToken(forceRefresh);
  return fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" });
  await signOut(clientAuth);
}

export const homeFor = (role: string) => (role === "teacher" ? "/admin" : "/dashboard");
