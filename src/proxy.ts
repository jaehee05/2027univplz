import { NextResponse, type NextRequest } from "next/server";

/**
 * 낙관적 검사만 한다 — 쿠키 유무로 로그인 화면을 먼저 보여주기 위한 것.
 * 실제 권한 확인은 각 화면 · Route Handler 의 DAL(`lib/auth/dal.ts`)에서 한다.
 */
const PUBLIC_PATHS = ["/login", "/signup"];
/** 로그인은 했지만 아직 못 쓰는 계정이 머무는 자리. 쿠키가 있어야 의미가 있다. */
const SESSION_PATHS = ["/pending"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("univplz_session");

  if (!hasSession && !PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 승인 대기 화면은 로그인한 사람만 본다. 쿠키가 없으면 위에서 이미 걸러졌다.
  if (SESSION_PATHS.includes(pathname)) return NextResponse.next();

  if (hasSession && PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // public/ 에 둔 정적 파일은 지나가게 둔다 — 로그인 화면으로 튕길 이유가 없다.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|pdf|mjs|js|css|woff2?)$).*)",
  ],
};
