"use client";

import { useEffect } from "react";
import { useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";
import { info, error as logError } from "@/lib/logger";

type Mode = "signin" | "signup";

export default function AuthPage() {
  useEffect(() => {
    typeof window !== 'undefined' && (document.title = "Choretle - Sign In");
  }, []);

  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem("choretle_mode") as Mode) || "signin";
    }
    return "signin";
  });
  const [rememberEmail, setRememberEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem("choretle_remember_email") === "true";
    }
    return false;
  });
  const [savedEmail, setSavedEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem("choretle_saved_email") || "";
    }
    return "";
  });

  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem("choretle_mode", mode);
      localStorage.setItem("choretle_remember_email", String(rememberEmail));
      if (rememberEmail && email) {
        localStorage.setItem("choretle_saved_email", email);
      }
    }
  }, [mode, rememberEmail, email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    info("[AUTH PAGE] Starting auth flow", { mode });
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "signin" ? "/api/auth/signin" : "/api/auth/signup";
      const body: Record<string, string> = { email, password };
      if (mode === "signup") body.name = name;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      info({ status: response.status }, "[AUTH PAGE] Response status");
      const data = await response.json();
      info({ data }, "[AUTH PAGE] Response data");

      if (response.ok) {
        // After signup, redirect to /family for create/join flow
        window.location.href = "/family";
      } else {
        setError(data.error || `${mode === "signin" ? "Sign in" : "Sign up"} failed`);
      }
    } catch (err) {
      logError({ err }, "[AUTH PAGE] Error");
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <main className="flex items-center justify-center min-h-[60vh]">
        <Card accent="bubblegum" className="w-full max-w-md p-8">
          <h1 className="font-display text-3xl font-bold text-center text-ink mb-6">
            {mode === "signin" ? "Sign In" : "Sign Up"}
          </h1>
          {error && (
            <div className="flex items-center gap-2 text-coral bg-coral/10 px-4 py-3 rounded-xl mb-4">
              <AlertCircle size={18} />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-grape focus:outline-none"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-grape focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-grape focus:outline-none"
            />
            <label className="flex items-center gap-2 text-sm font-bold text-ink/70 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                className="size-5 accent-grape"
              />
              Remember my email
            </label>
            <Button variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Sign Up"}
            </Button>
          </form>
          <div className="text-center mt-6">
            <p className="text-ink/60 text-sm">
              {mode === "signin"
                ? "Don't have an account? "
                : "Already have an account? "}
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-grape hover:text-grape/80 font-bold underline"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </Card>
      </main>
    </PageShell>
  );
}
