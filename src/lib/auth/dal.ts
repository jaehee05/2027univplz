import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { adminDb } from "@/lib/firebase/admin";
import type { AppUser, SessionUser } from "@/lib/types/user";
import { verifySession } from "@/lib/auth/session";

/**
 * Data Access Layer — 서버에서 "지금 누구인가"를 묻는 유일한 통로.
 * 한 요청 안에서는 cache() 로 한 번만 검증한다.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await verifySession();
  if (!session) return null;

  const snap = await adminDb().collection("users").doc(session.uid).get();
  if (!snap.exists) return null;

  const data = snap.data() as AppUser;
  if (!data.active) return null;

  return {
    uid: session.uid,
    email: data.email,
    displayName: data.displayName,
    role: data.role,
  };
});

/** 화면(Server Component)에서 쓰는 가드 — 실패 시 리다이렉트. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireTeacher(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "teacher") redirect("/dashboard");
  return user;
}

/** Route Handler 에서 쓰는 가드 — 실패 시 Response 를 돌려준다. */
export async function apiUser(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

export async function apiTeacher(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const result = await apiUser();
  if (!result.ok) return result;
  if (result.user.role !== "teacher") {
    return {
      ok: false,
      response: Response.json({ error: "선생님 계정만 접근할 수 있습니다." }, { status: 403 }),
    };
  }
  return result;
}
