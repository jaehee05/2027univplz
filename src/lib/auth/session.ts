import "server-only";

import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env";
import { adminAuth } from "@/lib/firebase/admin";

export const SESSION_COOKIE = "univplz_session";

function maxAgeMs() {
  return serverEnv.sessionCookieDays * 24 * 60 * 60 * 1000;
}

/** 로그인 직후 받은 ID 토큰을 httpOnly 세션 쿠키로 바꿔 심는다. */
export async function createSession(idToken: string): Promise<void> {
  const expiresIn = maxAgeMs();
  const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** 쿠키를 검증해 uid 를 돌려준다. 유효하지 않으면 null. */
export async function verifySession(): Promise<{ uid: string; email?: string } | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  try {
    // checkRevoked=true — 계정 정지 · 강제 로그아웃을 즉시 반영한다.
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
