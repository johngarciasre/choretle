"use client";

import { useEffect, useState } from "react";

export function useAuthRedirect() {
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch("/api/auth/me")
        .then((res) => {
          if (!res.ok) {
            window.location.href = "/auth/signin";
          }
        })
        .catch(() => {
          window.location.href = "/auth/signin";
        })
        .finally(() => setAuthChecked(true));
    }
  }, []);

  return authChecked;
}
