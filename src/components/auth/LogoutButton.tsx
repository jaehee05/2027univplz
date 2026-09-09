"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { logout } from "@/lib/auth/client";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await logout();
        router.replace("/login");
        router.refresh();
      }}
      className="text-sm text-neutral-500 underline disabled:opacity-50"
    >
      로그아웃
    </button>
  );
}
