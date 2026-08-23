"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/jobs", label: "Jobs" },
  { href: "/slates", label: "Slates" },
  { href: "/rotations", label: "Rotations" },
  { href: "/reports", label: "Reports" },
  { href: "/swap-meet", label: "Swap Meet" },
  { href: "/family", label: "Family" },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setUser(data.data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    return pathname?.startsWith(href + "/");
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/auth/signin");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  return (
    <nav className="sticky top-0 z-40 bg-cream/90 backdrop-blur border-b-2 border-ink/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        {/* Left: Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <Star className="text-coral fill-coral size-7" />
          <span className="font-display text-2xl font-bold text-ink">Choretle</span>
        </Link>

        {/* Right: Nav links + user chip */}
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

          {/* User chip + sign out (only rendered after auth resolves) */}
          {loading ? null : user ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white border-2 border-ink/10 px-3 py-1 text-sm font-bold text-ink truncate max-w-[150px]">
                {user?.email}
              </span>
              <button
                onClick={handleSignOut}
                className="px-3 py-2 rounded-full text-sm font-bold bg-white border-2 border-ink/15 hover:border-grape/40 transition text-ink"
              >
                Sign Out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

export default NavBar;
