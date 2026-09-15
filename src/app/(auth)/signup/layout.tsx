import type { Metadata } from "next";
import type { ReactNode } from "react";

/** 이 화면은 클라이언트 컴포넌트라 제목을 직접 못 붙인다. 겉틀에서 붙여 준다. */
export const metadata: Metadata = { title: "가입 신청" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
