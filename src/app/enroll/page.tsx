"use client";

/**
 * Reachable from a QR code (`/enroll#<code>`). The code arrives in the fragment
 * so it never reaches a proxy log, and it is consumed exactly once.
 */

import { useEffect, useState } from "react";

export default function EnrollPage() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Setting up this device.");

  useEffect(() => {
    const code = window.location.hash.replace(/^#/, "").trim();
    if (!code) {
      setState("error");
      setMessage("That setup link is missing its code.");
      return;
    }

    fetch("/api/auth/enroll/consume", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, label: navigator.userAgent.slice(0, 120) }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("error");
          setMessage(data.error || "That setup link did not work.");
          return;
        }
        setState("done");
        setMessage("This device is ready.");
        window.history.replaceState(null, "", "/enroll");
        window.setTimeout(() => {
          window.location.href = data.kind === "kid" ? "/jobs" : "/profiles";
        }, 800);
      })
      .catch(() => {
        setState("error");
        setMessage("That setup link did not work.");
      });
  }, []);

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl font-bold text-ink">
          {state === "error" ? "Something went wrong." : state === "done" ? "All set!" : "One moment."}
        </h1>
        <p className="mt-3 text-ink/70">{message}</p>
        {state === "error" ? (
          <a href="/profiles" className="mt-6 inline-block rounded-2xl bg-coral px-6 py-3 font-bold text-white">
            Go to the picker
          </a>
        ) : null}
      </div>
    </main>
  );
}
