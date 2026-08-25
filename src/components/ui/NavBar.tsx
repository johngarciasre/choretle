"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Star, User, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { User as SupaUser } from "@supabase/supabase-js";
import { error } from "@/lib/logger";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/jobs", label: "Jobs" },
  { href: "/slates", label: "Slates" },
  { href: "/rotations", label: "Rotations" },
  { href: "/reports", label: "Reports" },
  // { href: "/swap-meet", label: "Swap Meet" },
  { href: "/family", label: "Family" },
];

interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
  }, [menuOpen]);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    return pathname?.startsWith(href + "/");
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "global" }),
      });
      // Clear the dev-signout flag so user can sign in again
      if (typeof window !== 'undefined') {
        document.cookie = "dev-signout; path=/; secure=false";
      }
      router.push("/");
    } catch (e) {
      error("Sign out failed", { err: e });
      router.push("/");
    }
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? "");

  return (
    <nav className="sticky top-0 z-40 bg-cream/90 backdrop-blur border-b-2 border-ink/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        {/* Left: Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <Star className="text-coral fill-coral size-7" />
          <span className="font-display text-2xl font-bold text-ink">Choretle</span>
        </Link>

        {/* Right: Nav links + profile */}
        <div className="flex items-center gap-3">
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-3 py-2 rounded-full text-sm font-bold transition",
                  isActive(href)
                    ? "bg-grape/15 text-grape"
                    : "text-ink/70 hover:bg-ink/5 hover:text-ink"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Auth area */}
          {loading ? null : user ? (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1 rounded-full bg-white border-2 border-ink/10 px-2 py-1 transition hover:border-grape/40"
                title={user.email}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-grape text-sm font-bold text-white">
                  {initials}
                </div>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-[200px] rounded-lg border-2 border-ink/10 bg-white shadow-md z-50">
                  <div className="border-b-2 border-b-ink/10 px-4 py-3">
                    <p className="text-sm font-bold text-ink truncate">{user.name || user.email}</p>
                    <p className="text-xs text-ink/60 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 border-t-2 border-t-ink/5 px-4 py-3 text-sm font-bold text-ink/70 transition hover:bg-ink/5 hover:text-ink"
                  >
                    <LogOut className="size-5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth/signin"
              className="rounded-full bg-grape px-4 py-2 text-sm font-bold text-white transition hover:bg-grape/80"
            >
              Sign Up
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default NavBar;
