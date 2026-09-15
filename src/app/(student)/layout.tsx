import type { ReactNode } from "react";

import { StudentHeader } from "@/components/shell/StudentHeader";
import { StudentTabBar } from "@/components/shell/StudentTabBar";
import { requireUser } from "@/lib/auth/dal";

/**
 * 학생 화면의 겉틀. 넓으면 위 머리글, 좁으면 아래 탭바로 오간다.
 * 둘 다 작성 화면(`/write`)에서는 스스로 빠진다 — 그 화면은 제 틀을 따로 쓴다.
 */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh">
      <StudentHeader name={user.displayName} />
      {children}
      <StudentTabBar />
    </div>
  );
}
