import { NextResponse, type NextRequest } from "next/server";

/**
 * 낙관적 검사만 한다 — 쿠키 유무로 로그인 화면을 먼저 보여주기 위한 것.
 * 실제 권한 확인은 각 화면 · Route Handler 의 DAL(`lib/auth/dal.ts`)에서 한다.
 */
const PUBLIC_PATHS = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("univplz_session");

  if (!hasSession && !PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // public/ 에 내놓은 정적 파일은 지나가게 둔다.
  // pdfjs 워커(.mjs)가 여기 안 걸려 로그인으로 튕기면 가림칠 화면이 통째로 죽는다.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|pdf|mjs|js|css|woff2?)$).*)",
  ],
};
