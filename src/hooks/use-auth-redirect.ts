"use client";

import { useEffect, useState } from "react";

export function useAuthRedirect() {
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch("/api/auth/me")
        .then((res) => {
          if (!res.ok) {
            window.location.href = "/";
          }
        })
        .catch(() => {
          window.location.href = "/";
        })
        .finally(() => setAuthChecked(true));
    }
  }, []);

  return authChecked;
}
