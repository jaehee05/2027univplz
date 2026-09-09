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

export interface SessionClaims {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
}

/**
 * 쿠키를 검증해 uid 와 claim 을 돌려준다. 유효하지 않으면 null.
 *
 * 기본은 서명만 확인한다(로컬 검증, 왕복 없음).
 * `checkRevoked` 를 켜면 Google 에 한 번 물어 계정 정지 · 강제 로그아웃을 즉시 반영하는데
 * 왕복이 300ms 넘게 걸려서, 화면을 그릴 때마다 하지 않고 로그인 · 중요한 변경에서만 켠다.
 */
export async function verifySession(options?: { checkRevoked?: boolean }): Promise<SessionClaims | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, options?.checkRevoked ?? false);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
      role: typeof decoded.role === "string" ? decoded.role : undefined,
    };
  } catch {
    return null;
  }
}
