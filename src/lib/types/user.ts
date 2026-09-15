export type Role = "teacher" | "student";

/**
 * 가입 승인 상태. 학생은 아무나 가입 신청할 수 있고, 선생님이 받아 줘야 쓸 수 있다.
 * 이 값이 없는 예전 계정은 `approved` 로 본다 — 초대 코드로 이미 들어온 사람들이다.
 */
export type Approval = "pending" | "approved" | "rejected";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  /** 학생에게만 있음 — 담당 선생님 uid */
  teacherId?: string;
  approval: Approval;
  /** 선생님이 잠시 막아 둔 상태. 승인과는 다르다 — 받아들인 뒤에 쉬게 하는 것. */
  active: boolean;
  createdAt: string;
  approvedAt?: string;
}

/** 세션에서 꺼내 화면·API 로 넘기는 최소 정보 (DTO) */
export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
}

/** 아직 못 쓰는 계정이 왜 그런지 — `/pending` 화면이 이것만 보고 그린다. */
export type BlockedReason = "pending" | "rejected" | "suspended";
