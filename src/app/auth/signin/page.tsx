"use client";

import { useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed");
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <form onSubmit={handleSignIn} className="space-y-4 p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center">Sign In</h1>
        {error && <p className="text-red-600">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-2 border rounded-lg"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-4 py-2 border rounded-lg"
        />
        <button type="submit" className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          Sign In
        </button>
        <div className="text-center text-sm mt-4">
          Don&apos;t have an account?{" "}
          <a href="/auth/signup" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Sign up
          </a>
        </div>
      </form>
    </div>
  );
}
