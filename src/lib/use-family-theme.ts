"use client";

import { useState, useEffect } from "react";
import type { ThemeName } from "./theme";

export function useFamilyTheme(): ThemeName | null {
  const [theme, setTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        if (!meRes.ok) return;
        const me = await meRes.json();
        if (!me.familyId) return;

        const famRes = await fetch(`/api/family?id=${me.familyId}`, { credentials: "include" });
        if (!famRes.ok) return;
        const data = await famRes.json();
        const t = data.family?.theme;
        if (t) setTheme(t as ThemeName);
      } catch {
        // ignore — will fall through to default
      }
    };
    fetchTheme();
  }, []);

  return theme;
}
