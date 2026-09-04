"use client";

import { useEffect, useState } from "react";

export function useAuthRedirect() {
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch("/api/auth/me", { credentials: "include" })
        .then((res) => {
          if (!res.ok) {
            window.location.href = "/auth/signin";
            return;
          }
          setAuthChecked(true);
        })
        .catch(() => {
          window.location.href = "/auth/signin";
        });
    }
  }, []);

  return authChecked;
}
