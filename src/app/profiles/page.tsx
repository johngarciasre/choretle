"use client";

/**
 * Shared-tablet profile picker, with the kiosk leaderboard behind it so an idle
 * tablet still looks alive. A parent enrols the tablet once from the household
 * page; after that this screen needs no adult.
 */

import { useEffect, useState } from "react";
import { PIN_EMOJI, PIN_LENGTH } from "@/lib/pin-emoji";

interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Leaderboard {
  household: { name: string };
  members: { user: { id: string; name: string; avatarUrl: string | null }; points: number; streakDays: number }[];
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [householdName, setHouseholdName] = useState<string>("");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [pin, setPin] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/profiles", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          setEnrolled(false);
          return null;
        }
        setEnrolled(true);
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setProfiles(data.profiles ?? []);
        setHouseholdName(data.household?.name ?? "");
      })
      .catch(() => setEnrolled(false));

    fetch("/api/kiosk/leaderboard", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBoard(data))
      .catch(() => {});
  }, []);

  const tapEmoji = (id: string) => {
    setError(null);
    setPin((current) => {
      if (current.length >= PIN_LENGTH) return current;
      const next = [...current, id];
      if (next.length === PIN_LENGTH) void submit(next);
      return next;
    });
  };

  const submit = async (value: string[]) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/kid", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, pin: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "That did not work. Try again.");
        setPin([]);
        return;
      }
      window.location.href = "/jobs";
    } finally {
      setBusy(false);
    }
  };

  if (enrolled === false) {
    return (
      <main className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl font-bold text-ink">This tablet is not set up yet.</h1>
          <p className="mt-3 text-ink/70">Ask a grown-up to scan the setup code from the household page.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="text-center">
          <p className="text-sm uppercase tracking-wide text-ink/50">{householdName || "Household"}</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink">
            {selected ? `Hi, ${selected.name}!` : "Who is here?"}
          </h1>
        </header>

        {!selected ? (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(profiles ?? []).map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setSelected(profile);
                  setPin([]);
                  setError(null);
                }}
                className="rounded-3xl bg-white p-6 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-coral/40"
              >
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="mx-auto size-20 rounded-full object-cover"
                  />
                ) : (
                  <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-coral/15 font-display text-3xl font-bold text-coral">
                    {profile.name.slice(0, 1)}
                  </span>
                )}
                <span className="mt-3 block font-display text-xl font-bold text-ink">{profile.name}</span>
              </button>
            ))}
            {profiles !== null && profiles.length === 0 ? (
              <p className="col-span-full text-center text-ink/60">
                No one here has a picture code yet. A grown-up can set one on the household page.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center justify-center gap-3" aria-live="polite">
              {Array.from({ length: PIN_LENGTH }).map((_, index) => {
                const chosen = PIN_EMOJI.find((entry) => entry.id === pin[index]);
                return (
                  <span
                    key={index}
                    className="flex size-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm"
                  >
                    {chosen ? chosen.glyph : ""}
                  </span>
                );
              })}
            </div>

            <div className="mt-6 grid grid-cols-6 gap-2">
              {PIN_EMOJI.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => tapEmoji(entry.id)}
                  disabled={busy}
                  aria-label={entry.label}
                  className="flex aspect-square items-center justify-center rounded-2xl bg-white text-2xl shadow-sm hover:bg-white/70 focus:outline-none focus-visible:ring-4 focus-visible:ring-coral/40 disabled:opacity-50"
                >
                  {entry.glyph}
                </button>
              ))}
            </div>

            {error ? (
              <p className="mt-4 text-center font-medium text-coral" role="status">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPin([]);
                  setError(null);
                }}
                className="rounded-2xl px-5 py-3 font-medium text-ink/70 hover:text-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setPin([])}
                className="rounded-2xl px-5 py-3 font-medium text-ink/70 hover:text-ink"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {board && board.members.length > 0 ? (
          <section className="mt-12" aria-label="Leaderboard">
            <h2 className="font-display text-xl font-bold text-ink">This week</h2>
            <ol className="mt-3 space-y-2">
              {board.members.slice(0, 5).map((member) => (
                <li
                  key={member.user.id}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
                >
                  <span className="font-medium text-ink">{member.user.name}</span>
                  <span className="flex items-center gap-4 text-sm text-ink/60">
                    <span>{member.streakDays} day streak</span>
                    <span className="font-display text-lg font-bold text-coral">{member.points}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </main>
  );
}
