import { z } from "zod";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { createSession, destroySession } from "@/lib/auth/session";

const bodySchema = z.object({ idToken: z.string().min(10) });

/** 로그인 — ID 토큰을 세션 쿠키로 교환한다. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true);
    uid = decoded.uid;
  } catch {
    return Response.json({ error: "인증에 실패했습니다. 다시 로그인해 주세요." }, { status: 401 });
  }

  const snap = await adminDb().collection("users").doc(uid).get();
  if (!snap.exists) {
    // Firebase 계정은 있지만 우리 서비스에 등록되지 않은 상태 → 가입 절차로 보낸다.
    return Response.json({ error: "등록되지 않은 계정입니다.", code: "NOT_REGISTERED" }, { status: 409 });
  }
  if (snap.data()?.active === false) {
    return Response.json({ error: "비활성화된 계정입니다." }, { status: 403 });
  }

  await createSession(parsed.data.idToken);
  return Response.json({ ok: true, role: snap.data()?.role });
}

/** 로그아웃 */
export async function DELETE() {
  await destroySession();
  return Response.json({ ok: true });
}
