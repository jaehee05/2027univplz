import { getCurrent } from "@/lib/auth/dal";

/**
 * 지금 내 계정이 쓸 수 있는 상태인지만 알려 준다.
 *
 * 승인 대기 화면이 이걸 주기적으로 물어, 선생님이 받아 준 순간 스스로 넘어간다 —
 * 학생이 언제 다시 들어와 봐야 하는지 몰라 새로고침을 반복하지 않게.
 */
export async function GET() {
  const current = await getCurrent();

  if (current.ok) {
    return Response.json({ ok: true, role: current.user.role });
  }
  return Response.json({ ok: false, reason: current.reason });
}
