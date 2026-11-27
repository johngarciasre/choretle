"use client";

/**
 * Shared-tablet idle guard.
 *
 * Only arms for a PIN session. Real interaction keeps the session alive (the
 * server is the authority; this is the courtesy), and after four idle minutes a
 * kid-friendly countdown appears. At five the screen returns to the picker.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 5 * 60 * 1000;
const WARNING_AT_MS = 4 * 60 * 1000;
const TOUCH_THROTTLE_MS = 30 * 1000;

export function IdleGuard() {
  const [armed, setArmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastActivity = useRef(0);
  const lastTouch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const pinSession = data?.kind === "kid" || data?.kind === "tablet_adult";
        if (pinSession) lastActivity.current = Date.now();
        setArmed(pinSession);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stay = useCallback(() => {
    lastActivity.current = Date.now();
    setSecondsLeft(0);
  }, []);

  useEffect(() => {
    if (!armed) return;

    const onActivity = () => {
      lastActivity.current = Date.now();
      setSecondsLeft(0);
      const now = Date.now();
      if (now - lastTouch.current > TOUCH_THROTTLE_MS) {
        lastTouch.current = now;
        fetch("/api/auth/touch", { method: "POST", credentials: "include" }).catch(() => {});
      }
    };

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel"];
    for (const event of events) window.addEventListener(event, onActivity, { passive: true });

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LIMIT_MS) {
        window.clearInterval(timer);
        fetch("/api/auth/signout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .catch(() => {})
          .finally(() => {
            window.location.href = "/profiles";
          });
        return;
      }
      setSecondsLeft(idle >= WARNING_AT_MS ? Math.ceil((IDLE_LIMIT_MS - idle) / 1000) : 0);
    }, 1000);

    return () => {
      for (const event of events) window.removeEventListener(event, onActivity);
      window.clearInterval(timer);
    };
  }, [armed]);

  if (!armed || secondsLeft <= 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
    >
      <div className="bg-cream rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <h2 id="idle-title" className="font-display text-2xl font-bold text-ink">
          Still there?
        </h2>
        <p className="mt-2 text-ink/70">Tap a picture to keep going.</p>
        <p className="mt-4 font-display text-3xl font-bold text-coral" aria-live="polite">
          {secondsLeft}
        </p>
        <button
          type="button"
          onClick={stay}
          className="mt-6 w-full rounded-2xl bg-coral px-6 py-3 font-display text-lg font-bold text-white hover:opacity-90"
        >
          I am here
        </button>
      </div>
    </div>
  );
}
