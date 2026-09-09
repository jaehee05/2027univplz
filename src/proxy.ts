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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|pdf)$).*)"],
};
