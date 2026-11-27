"use client";

/**
 * The phone half of pairing a camera-less device: reached by scanning the QR on
 * the tablet (`/enroll/approve#<code>`). Approving mints the tablet's enrollment
 * code, so this page is the only thing standing between a scanned code and a
 * new picker session in the household.
 */

import { useState } from "react";
import Link from "next/link";
import { Check, Smartphone } from "lucide-react";

type State = "ready" | "working" | "done" | "signedout" | "error";

export default function ApproveDevicePage() {
  const [state, setState] = useState<State>("ready");
  const [message, setMessage] = useState("");

  // Read at click time rather than in an effect: the fragment is not available
  // while prerendering, and nothing here is worth a hydration mismatch.
  const approve = async () => {
    const code = window.location.hash.replace(/^#/, "").trim();
    if (!code) {
      setState("error");
      setMessage("That setup link is missing its code.");
      return;
    }
    setState("working");
    const res = await fetch("/api/auth/enroll/pair/approve", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setState("signedout");
      setMessage("Sign in on this phone, then scan the tablet's code again.");
      return;
    }
    if (!res.ok) {
      setState("error");
      setMessage(data.error || "That tablet could not be approved.");
      return;
    }
    setState("done");
    setMessage("The tablet will finish setting up on its own.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="w-full max-w-md rounded-3xl bg-white/70 p-6 text-center">
        <Smartphone size={28} className="mx-auto text-ink" aria-hidden />
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">Approve this tablet?</h1>

        {state === "done" ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-ink/70">
            <Check size={16} aria-hidden />
            {message}
          </p>
        ) : state === "signedout" ? (
          <>
            <p className="mt-3 text-sm text-ink/70">{message}</p>
            <Link href="/auth/signin" className="mt-5 inline-block font-bold text-coral hover:underline">
              Go to sign in
            </Link>
          </>
        ) : state === "error" ? (
          <p className="mt-3 text-sm font-medium text-coral">{message}</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink/70">
              Approving lets that tablet stay signed in to your household as a picker.
            </p>
            <button
              type="button"
              onClick={approve}
              disabled={state === "working"}
              className="mt-5 w-full rounded-2xl bg-coral px-6 py-3 font-bold text-white disabled:opacity-60"
            >
              {state === "working" ? "Approving…" : "Approve tablet"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
