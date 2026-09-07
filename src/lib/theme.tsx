import { createContext, useContext } from "react";

export const PALETTES: Record<string, { primary: string; secondary: string; tertiary: string }> = {
  // Warm palette
  coral:  { primary: "#FF6B6B", secondary: "#FFD166", tertiary: "#0FC4A8" },
  sunny:  { primary: "#FFD166", secondary: "#0FC4A8", tertiary: "#FF6B6B" },
  teal:   { primary: "#0FC4A8", secondary: "#FF6B6B", tertiary: "#FFD166" },
  // Cool palette
  grape:  { primary: "#9B5DE5", secondary: "#F15BB5", tertiary: "#4A6BDE" },
  bubblegum: { primary: "#F15BB5", secondary: "#4A6BDE", tertiary: "#9B5DE5" },
  indigo: { primary: "#4A6BDE", secondary: "#9B5DE5", tertiary: "#F15BB5" },
};

export type ThemeName = keyof typeof PALETTES;

const ThemeContext = createContext<ThemeName | null>(null);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({
  children,
  familyTheme,
}: {
  children: React.ReactNode;
  familyTheme?: string | null;
}) {
  const theme = (familyTheme && PALETTES[familyTheme] ? familyTheme : "coral") as ThemeName;
  const p = PALETTES[theme];
  return (
    <ThemeContext.Provider value={theme}>
      <div style={{
        "--theme-primary": p.primary,
        "--theme-secondary": p.secondary,
        "--theme-tertiary": p.tertiary,
      } as React.CSSProperties}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
