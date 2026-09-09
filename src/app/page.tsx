import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/dal";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "teacher" ? "/admin" : "/dashboard");
}
