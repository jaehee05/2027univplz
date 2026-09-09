import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { createSession } from "@/lib/auth/session";
import type { Role } from "@/lib/types/user";

const bodySchema = z.object({
  idToken: z.string().min(10),
  displayName: z.string().trim().min(1, "이름을 입력해 주세요.").max(40),
  inviteCode: z.string().trim().toUpperCase().optional(),
});

/**
 * 가입 확정 — Firebase Auth 계정에 우리 서비스의 역할을 붙인다.
 *  · 첫 사용자는 teacher 가 된다 (meta/system 트랜잭션으로 한 명만 보장).
 *  · 이후 가입자는 teacher 가 발급한 초대 코드가 있어야 한다.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const { idToken, displayName, inviteCode } = parsed.data;

  let uid: string;
  let email: string;
  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    uid = decoded.uid;
    email = decoded.email ?? "";
  } catch {
    return Response.json({ error: "인증에 실패했습니다. 다시 로그인해 주세요." }, { status: 401 });
  }

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const systemRef = db.collection("meta").doc("system");

  let role: Role;
  try {
    role = await db.runTransaction(async (tx) => {
      const [userSnap, systemSnap] = await Promise.all([tx.get(userRef), tx.get(systemRef)]);
      if (userSnap.exists) {
        return (userSnap.data()?.role ?? "student") as Role;
      }

      const bootstrapped = systemSnap.exists && systemSnap.data()?.teacherBootstrapped === true;

      // ── 첫 사용자 → teacher ─────────────────────────────────────
      if (!bootstrapped) {
        tx.set(
          systemRef,
          { teacherBootstrapped: true, firstTeacherUid: uid, bootstrappedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        tx.set(userRef, {
          uid,
          email,
          displayName,
          role: "teacher",
          active: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        return "teacher" as Role;
      }

      // ── 이후 사용자 → 초대 코드 필요 ────────────────────────────
      if (!inviteCode) {
        throw new Error("INVITE_REQUIRED");
      }
      const inviteRef = db.collection("invites").doc(inviteCode);
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) throw new Error("INVITE_INVALID");

      const invite = inviteSnap.data()!;
      if (invite.usedBy) throw new Error("INVITE_USED");
      if (invite.expiresAt?.toMillis && invite.expiresAt.toMillis() < Date.now()) {
        throw new Error("INVITE_EXPIRED");
      }

      const invitedRole = (invite.role ?? "student") as Role;
      tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() });
      tx.set(userRef, {
        uid,
        email,
        displayName,
        role: invitedRole,
        ...(invitedRole === "student" ? { teacherId: invite.createdBy } : {}),
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      return invitedRole;
    });
  } catch (error) {
    const messages: Record<string, string> = {
      INVITE_REQUIRED: "초대 코드가 필요합니다. 선생님께 코드를 받아 주세요.",
      INVITE_INVALID: "존재하지 않는 초대 코드입니다.",
      INVITE_USED: "이미 사용된 초대 코드입니다.",
      INVITE_EXPIRED: "만료된 초대 코드입니다.",
    };
    const key = error instanceof Error ? error.message : "";
    if (messages[key]) return Response.json({ error: messages[key] }, { status: 400 });
    throw error;
  }

  // 보안 규칙에서 바로 쓸 수 있도록 custom claim 에도 역할을 심는다.
  // 이름도 Auth 프로필에 넣어 두면 토큰에 실려 와서, 화면을 그릴 때 Firestore 를 안 읽어도 된다.
  await Promise.all([
    adminAuth().setCustomUserClaims(uid, { role }),
    adminAuth().updateUser(uid, { displayName }),
  ]);

  await createSession(idToken);

  // claim 이 담긴 토큰으로 세션을 다시 발급받도록 클라이언트에 알린다.
  return Response.json({ ok: true, role, refreshToken: true });
}
