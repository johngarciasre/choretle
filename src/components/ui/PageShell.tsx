"use client";

import { NavBar } from "./NavBar";
import { Footer } from "./Footer";
import { useTheme, PALETTES } from "@/lib/theme";

export function PageShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const bg = theme ? PALETTES[theme].tertiary : "#FFF8EC";
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: bg }}>
      <NavBar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
