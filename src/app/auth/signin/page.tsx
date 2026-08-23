"use client";

import { useState, useEffect } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if we're already logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me?_t=" + Date.now());
      if (res.ok) {
        window.location.href = "/";
      }
    } catch (e) {
      console.log("Not logged in yet");
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    console.log("[SIGNIN PAGE] Starting sign in process");
    setError("");
    setLoading(true);
    
    try {
      console.log("[SIGNIN PAGE] Sending fetch to /api/auth/signin");
      
      const response = await fetch("/api/auth/signin?_t=" + Date.now(), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      
      console.log("[SIGNIN PAGE] Response status:", response.status);
      console.log("[SIGNIN PAGE] All response headers:");
      for (const [key, value] of response.headers) {
        if (!key.includes("set-cookie")) {
          console.log(`  ${key}: ${value}`);
        }
      }
      
      const data = await response.json();
      console.log("[SIGNIN PAGE] Response JSON:", data);
      console.log("[SIGNIN PAGE] Cookies stored by browser - check DevTools Application tab");
      
      if (response.ok) {
        console.log("[SIGNIN PAGE] Sign in successful, redirecting to /");
        window.location.href = "/";
      } else {
        let errorMessage = "Sign in failed";
        if (data.error) {
          errorMessage = data.error;
        }
        setError(errorMessage);
      }
    } catch (err) {
      console.error("[SIGNIN PAGE] Sign in error:", err);
      setError("An error occurred during sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSignIn} className="space-y-4 p-8 rounded-lg shadow-lg w-full max-w-md bg-white">
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
        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          {loading ? "Signing in..." : "Sign In"}
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
