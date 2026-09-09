import { apiTeacher } from "@/lib/auth/dal";
import { listStudents } from "@/lib/work/store";

export async function GET() {
  const auth = await apiTeacher();
  if (!auth.ok) return auth.response;

  return Response.json({ students: await listStudents(auth.user.uid) });
}
