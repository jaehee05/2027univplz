import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { adminDb } from "@/lib/firebase/admin";
import type { AppUser, BlockedReason, SessionUser } from "@/lib/types/user";
import { verifySession } from "@/lib/auth/session";

/**
 * Data Access Layer — 서버에서 "지금 누구인가"를 묻는 유일한 통로.
 * 한 요청 안에서는 cache() 로 한 번만 검증한다.
 */
/**
 * 지금 누구인가. 못 쓰는 계정이면 **왜 못 쓰는지**까지 돌려준다 —
 * 그냥 null 로 떨어뜨리면 승인 대기 중인 학생이 로그인 화면만 맴돌게 된다.
 */
export type CurrentUser =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: BlockedReason | null };

export const getCurrent = cache(async (): Promise<CurrentUser> => {
  const session = await verifySession();
  if (!session) return { ok: false, reason: null };

  // 역할과 이름이 토큰에 실려 오면 Firestore 를 읽지 않는다.
  // 역할 claim 은 승인이 끝난 계정에만 심으므로, 여기까지 온 것은 쓸 수 있는 계정이다.
  // 이름을 Auth 프로필에 넣기 전에 발급된 쿠키에는 이름이 없어서, 그때는 아래로 내려간다.
  if ((session.role === "teacher" || session.role === "student") && session.name) {
    return {
      ok: true,
      user: {
        uid: session.uid,
        email: session.email ?? "",
        displayName: session.name,
        role: session.role,
      },
    };
  }

  // claim 이나 이름이 아직 없는 계정은 문서를 본다.
  const snap = await adminDb().collection("users").doc(session.uid).get();
  if (!snap.exists) return { ok: false, reason: null };

  const data = snap.data() as AppUser;
  // 이 값이 없는 예전 계정은 초대 코드로 들어온 사람들이라 승인된 것으로 본다.
  const approval = data.approval ?? "approved";

  if (approval === "pending") return { ok: false, reason: "pending" };
  if (approval === "rejected") return { ok: false, reason: "rejected" };
  if (!data.active) return { ok: false, reason: "suspended" };

  return {
    ok: true,
    user: {
      uid: session.uid,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
    },
  };
});

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const current = await getCurrent();
  return current.ok ? current.user : null;
});

/**
 * 화면(Server Component)에서 쓰는 가드 — 실패 시 리다이렉트.
 * 로그인은 했는데 아직 못 쓰는 계정은 로그인 화면이 아니라 안내 화면으로 보낸다.
 */
export async function requireUser(): Promise<SessionUser> {
  const current = await getCurrent();
  if (current.ok) return current.user;
  redirect(current.reason ? "/pending" : "/login");
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
  const current = await getCurrent();
  if (!current.ok) {
    const message =
      current.reason === "pending"
        ? "선생님의 가입 승인을 기다리는 중입니다."
        : current.reason === "rejected"
          ? "가입이 받아들여지지 않았습니다."
          : current.reason === "suspended"
            ? "이용이 중지된 계정입니다."
            : "로그인이 필요합니다.";
    return {
      ok: false,
      response: Response.json({ error: message }, { status: current.reason ? 403 : 401 }),
    };
  }
  return { ok: true, user: current.user };
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
