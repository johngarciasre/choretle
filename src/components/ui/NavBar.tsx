"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { error } from "@/lib/logger";

const NAV_LINKS: { href: string; label: string; parentOnly?: boolean; kidOnly?: boolean }[] = [
  { href: "/jobs", label: "My Chores" },
  { href: "/my-jobs", label: "Board" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks", parentOnly: true },
  { href: "/slates", label: "Slates", parentOnly: true },
  { href: "/rotations", label: "Rotations", parentOnly: true },
  { href: "/reports", label: "Reports", parentOnly: true },
  { href: "/profiles", label: "Switch profile", kidOnly: true },
  // { href: "/swap-meet", label: "Swap Meet" },
];

interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export function NavBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [households, setHouseholds] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user ?? null);
        setHouseholdId(data.householdId || null);
        setKind(data.kind ?? null);
        setHouseholds(data.households ?? []);
        // Fetch household name if user has a household
        if (data.householdId) {
          fetch(`/api/household?id=${data.householdId}`, { credentials: "include" })
            .then((r) => r.json())
            .then((f) => {
              if (f.ok && f.household) setHouseholdName(f.household.name);
            })
            .catch(() => {});
        } else {
          setHouseholdName(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    // Clear cached user and signout flag when navigating to auth pages
    if (pathname === "/auth/signin") {
      setUser(null);
      setLoading(false);
      document.cookie = "dev-signout; path=/; secure=false";
    }
  }, [pathname]);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    return pathname?.startsWith(href + "/");
  };

  const switchHousehold = async (id: string) => {
    if (id === householdId) {
      setMenuOpen(false);
      return;
    }
    await fetch("/api/auth/household", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId: id }),
    });
    window.location.reload();
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "global" }),
      });
      // Full reload picks up the signout cookie from server response
      window.location.href = "/";
    } catch (e) {
      error("Sign out failed", { err: e });
      window.location.href = "/";
    }
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? "");

  const isParent = user?.role === "parent" || user?.role === "admin";
  const isPinSession = kind === "kid" || kind === "tablet_adult";
  const navLinks = NAV_LINKS.filter(
    (link) => (!link.parentOnly || isParent) && (!link.kidOnly || isPinSession),
  );

  return (
    <nav className="sticky top-0 z-40 bg-cream/90 backdrop-blur border-b-2 border-ink/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Star className="text-coral fill-coral size-7" />
          <span className="font-display text-2xl font-bold text-ink">Choretle</span>
        </Link>

        {/* Right: Profile */}
        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <>
              <nav className="hidden lg:flex items-center gap-1">
                {navLinks.map(({ href, label }) => (
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

              {/* Profile dropdown */}
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
                  <div className="absolute right-0 top-full mt-2 w-[240px] rounded-lg border-2 border-ink/10 bg-white shadow-md z-50">
                    <div className="border-b-2 border-b-ink/10 px-4 py-3">
                      <p className="text-sm font-bold text-ink truncate">{user?.name || user?.email}</p>
                      {householdName && (
                        <p className="text-xs text-ink/60 truncate">🏠 {householdName}</p>
                      )}
                    </div>
                    {households.length > 1 && (
                      <div className="border-t-2 border-t-ink/5 px-2 py-2">
                        <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-ink/40">
                          Households
                        </p>
                        {households.map((entry) => (
                          <button
                            key={entry.id}
                            onClick={() => switchHousehold(entry.id)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                              entry.id === householdId
                                ? "bg-grape/15 font-bold text-grape"
                                : "text-ink/70 hover:bg-ink/5"
                            )}
                          >
                            <span className="truncate">{entry.name}</span>
                            <span className="ml-2 shrink-0 text-xs uppercase tracking-wide text-ink/40">
                              {entry.role}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {householdId && (
                      <Link
                        href="/household"
                        onClick={() => setMenuOpen(false)}
                        className="flex w-full items-center gap-2 border-t-2 border-t-ink/5 px-4 py-3 text-sm font-bold text-ink/70 transition hover:bg-grape/10 hover:text-grape"
                      >
                        <Star className="size-5 fill-coral text-coral" />
                        Household Settings
                      </Link>
                    )}
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
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="rounded-full bg-grape px-4 py-2 text-sm font-bold text-white transition hover:bg-grape/80"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default NavBar;
