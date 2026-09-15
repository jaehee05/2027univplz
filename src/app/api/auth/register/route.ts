import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { createSession } from "@/lib/auth/session";
import type { Role } from "@/lib/types/user";

const bodySchema = z.object({
  idToken: z.string().min(10),
  displayName: z.string().trim().min(1, "이름을 입력해 주세요.").max(40),
});

/**
 * 가입 신청 — Firebase Auth 계정에 우리 서비스의 역할을 붙인다.
 *  · 첫 사용자는 teacher 가 되고 바로 쓸 수 있다 (meta/system 트랜잭션으로 한 명만 보장).
 *  · 이후 가입자는 student 로 **신청만** 되고, 선생님이 받아 줘야 쓸 수 있다.
 *
 * 예전에는 선생님이 초대 코드를 미리 발급해 학생에게 건네야 했다. 학생이 코드를 잃어버리거나
 * 선생님이 사람마다 코드를 뽑아 두어야 해서 번거로웠고, 코드가 새면 아무나 들어올 수 있었다.
 * 지금은 누구나 신청하고 선생님이 명단에서 받아 준다 — 코드가 오가지 않는다.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const { idToken, displayName } = parsed.data;

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

  const result = await db.runTransaction(async (tx) => {
    const [userSnap, systemSnap] = await Promise.all([tx.get(userRef), tx.get(systemRef)]);

    // 이미 있는 계정이면 상태만 알려 준다 — 신청을 두 번 해도 덮어쓰지 않는다.
    if (userSnap.exists) {
      const data = userSnap.data()!;
      return {
        role: (data.role ?? "student") as Role,
        approval: (data.approval ?? "approved") as string,
      };
    }

    const bootstrapped = systemSnap.exists && systemSnap.data()?.teacherBootstrapped === true;

    // ── 첫 사용자 → teacher, 승인 절차 없음 ──────────────────────
    if (!bootstrapped) {
      tx.set(
        systemRef,
        {
          teacherBootstrapped: true,
          firstTeacherUid: uid,
          bootstrappedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(userRef, {
        uid,
        email,
        displayName,
        role: "teacher",
        approval: "approved",
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { role: "teacher" as Role, approval: "approved" };
    }

    // ── 이후 사용자 → student 신청. 선생님이 받아 줘야 한다 ──────
    // 담당 선생님은 처음 자리를 잡은 선생님으로 둔다. 선생님이 여럿이 되면
    // 신청 화면에서 고르게 해야 하지만, 지금은 한 분이라 여기서 정한다.
    const teacherId = (systemSnap.data()?.firstTeacherUid as string | undefined) ?? null;
    tx.set(userRef, {
      uid,
      email,
      displayName,
      role: "student",
      ...(teacherId ? { teacherId } : {}),
      approval: "pending",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { role: "student" as Role, approval: "pending" };
  });

  // 역할 claim 은 **쓸 수 있게 된 뒤에만** 심는다.
  // 승인 대기 중인 계정에 claim 을 주면 토큰만 보고 통과시키는 자리(`dal.getCurrentUser`)를
  // 그냥 지나가 버린다. claim 이 없으면 users 문서를 읽어 상태를 확인하게 된다.
  if (result.approval === "approved") {
    await adminAuth().setCustomUserClaims(uid, { role: result.role });
  }
  await adminAuth().updateUser(uid, { displayName });

  await createSession(idToken);

  // claim 이 담긴 토큰으로 세션을 다시 발급받도록 클라이언트에 알린다.
  return Response.json({
    ok: true,
    role: result.role,
    approval: result.approval,
    refreshToken: true,
  });
}
