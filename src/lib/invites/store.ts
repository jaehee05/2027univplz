import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { toIso } from "@/lib/exam/store";

export interface InviteRow {
  code: string;
  role: string;
  label: string | null;
  usedBy: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

/**
 * 한 선생님이 발급한 초대 코드 목록.
 * where + orderBy 를 함께 쓰면 복합 인덱스가 필요해서 정렬은 메모리에서 한다.
 */
export async function listInvites(uid: string): Promise<InviteRow[]> {
  const snap = await adminDb().collection("invites").where("createdBy", "==", uid).limit(200).get();

  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        code: doc.id,
        role: data.role,
        label: data.label ?? null,
        usedBy: data.usedBy ?? null,
        createdAt: toIso(data.createdAt),
        expiresAt: toIso(data.expiresAt),
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
