export type Role = "teacher" | "student";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  /** 학생에게만 있음 — 담당 선생님 uid */
  teacherId?: string;
  active: boolean;
  createdAt: string;
}

export interface Invite {
  code: string;
  role: Role;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedBy?: string;
  usedAt?: string;
  /** 발급 시 메모해 둔 학생 이름 */
  label?: string;
}

/** 세션에서 꺼내 화면·API 로 넘기는 최소 정보 (DTO) */
export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
}
