"use client";

/**
 * Pairing for a device nobody can type into — a wall tablet, a fridge door.
 *
 * The device asks the server for a code and shows it as a QR. A phone that is
 * already signed in as a parent scans it, approves, and the waiting device
 * finishes by consuming the ordinary single-use enrollment code. Nothing here is
 * authenticated: approval is the whole authorization step.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "@/components/QrCode";

const POLL_MS = 2000;

type State = "starting" | "waiting" | "approved" | "error";

export default function PairDevicePage() {
  const [state, setState] = useState<State>("starting");
  const [code, setCode] = useState<string | null>(null);
  const [link, setLink] = useState<string>("");
  const [message, setMessage] = useState("Getting this tablet ready.");

  // Held in a ref so the poll loop always uses the current code without
  // restarting itself on every render.
  const codeRef = useRef<string | null>(null);

  const finish = useCallback(async (value: string) => {
    const res = await fetch("/api/auth/enroll/consume", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value, label: navigator.userAgent.slice(0, 120) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setState("approved");
      setMessage("This tablet is ready.");
      window.setTimeout(() => {
        window.location.href = data.kind === "kid" ? "/jobs" : "/profiles";
      }, 800);
      return true;
    }
    if (res.status === 404) return false; // not approved yet
    setState("error");
    setMessage(data.error || "This tablet could not be set up. Refresh to try again.");
    return true; // stop polling
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const start = async () => {
      const res = await fetch("/api/auth/enroll/pair", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok || !data.code) {
        setState("error");
        setMessage(data.error || "Could not start pairing. Refresh to try again.");
        return;
      }
      codeRef.current = data.code;
      setCode(data.code);
      // Built from this device's own origin, so the phone scans a URL this
      // device could actually reach (the server does not know its LAN address).
      setLink(`${window.location.origin}/enroll/approve#${data.code}`);
      setState("waiting");
      setMessage("Waiting for a grown-up to approve this tablet.");

      const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 600000;
      const poll = async () => {
        if (cancelled) return;
        if (Date.now() > expiresAt) {
          setState("error");
          setMessage("That code expired. Refresh to start again.");
          return;
        }
        const done = await finish(codeRef.current!).catch(() => false);
        if (cancelled || done) return;
        timer = setTimeout(poll, POLL_MS);
      };
      timer = setTimeout(poll, POLL_MS);
    };

    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [finish]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="max-w-lg text-center">
        <h1 className="font-display text-3xl font-bold text-ink">Set up this tablet</h1>

        {state === "error" ? (
          <>
            <p className="mt-3 text-ink/70">{message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-2xl bg-coral px-6 py-3 font-bold text-white"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-ink/70">Scan this with a phone that is signed in as a parent.</p>
            <div className="mt-6 flex justify-center">
              {link ? <QrCode value={link} cell={8} /> : <div className="size-56 rounded-xl bg-white/60" />}
            </div>
            <p className="mt-4 break-all font-mono text-xs text-ink/50">{link}</p>
            <p className="mt-4 text-sm font-medium text-ink/70" role="status" aria-live="polite">
              {message}
            </p>
            {code ? <p className="mt-1 text-xs text-ink/40">Code expires in ten minutes.</p> : null}
          </>
        )}
      </div>
    </main>
  );
}
