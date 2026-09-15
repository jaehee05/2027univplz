import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";

import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  /**
   * 탭에 뜨는 이름. 화면마다 제 이름만 적으면 여기 틀에 끼워져
   * `KJHEDU - 내 과제` 처럼 나온다. 제 이름이 없는 화면은 `default` 가 쓰인다.
   *
   * 인쇄 화면도 이 이름을 쓴다 — 브라우저가 종이 머리글에 문서 제목을 얹는다.
   */
  title: {
    default: "KJHEDU",
    template: "KJHEDU - %s",
  },
  description: "대학별 채점 기준에 맞춘 인문 논술 답안 작성 · 첨삭 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full text-neutral-900">{children}</body>
    </html>
  );
}
