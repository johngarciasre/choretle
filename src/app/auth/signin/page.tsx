"use client";

import { useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    console.log("[SIGNIN PAGE] Starting sign in");
    setError("");
    setLoading(true);
    
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      
      console.log("[SIGNIN PAGE] Response status:", response.status);
      
      const data = await response.json();
      console.log("[SIGNIN PAGE] Response data:", data);
      
      if (response.ok) {
        window.location.href = "/";
      } else {
        setError(data.error || "Sign in failed");
      }
    } catch (err) {
      console.error("[SIGNIN PAGE] Error:", err);
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <main className="flex items-center justify-center min-h-[60vh]">
        <Card accent="bubblegum" className="w-full max-w-md p-8">
          <h1 className="font-display text-3xl font-bold text-center text-ink mb-6">Sign In</h1>
          {error && (
            <div className="flex items-center gap-2 text-coral bg-coral/10 px-4 py-3 rounded-xl mb-4">
              <AlertCircle size={18} />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}
          <form onSubmit={handleSignIn} className="space-y-4">
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
            <Button variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="text-center mt-6">
            <p className="text-ink/60 text-sm">
              Don&apos;t have an account?{" "}
              <a href="/auth/signup" className="text-grape hover:text-grape/80 font-bold underline">
                Sign up
              </a>
            </p>
          </div>
        </Card>
      </main>
    </PageShell>
  );
}
