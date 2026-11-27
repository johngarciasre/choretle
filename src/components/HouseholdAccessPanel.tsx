"use client";

/**
 * Household access panel: the admin surface for the things a parent has to do
 * that are not chores — enroll a tablet, add someone, set a picture PIN, and
 * manage report links with another household.
 *
 * Kept as one component so the household page only grows by one line.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, KeyRound, Link2, Plus, Smartphone, Trash2 } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { QrCode } from "@/components/QrCode";
import { PIN_EMOJI, PIN_LENGTH } from "@/lib/pin-emoji";

interface Member {
  id: string;
  name: string;
  role: string;
  email?: string | null;
}

interface Device {
  id: string;
  kind: string;
  mode: string;
  label: string | null;
  userName: string | null;
  lastSeenAt: string;
}

interface LinkRow {
  id: string;
  householdName: string;
  status: string;
  direction: "incoming" | "outgoing";
}

interface Props {
  householdId: string;
  members: Member[];
  onChanged?: () => void | Promise<void>;
}

/**
 * Copy without lying about it. A tablet opens the household page over plain
 * http on a LAN address, where `navigator.clipboard` does not exist, so fall
 * back to the old selection copy rather than reporting a success that never
 * happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission or insecure-context failure: try the fallback below.
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

export function HouseholdAccessPanel({ householdId, members, onChanged }: Props) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [enrollment, setEnrollment] = useState<{ code: string; url: string; forName: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [enrollFor, setEnrollFor] = useState("");
  const [pinTarget, setPinTarget] = useState<Member | null>(null);
  const [pin, setPin] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("child");
  const [newEmail, setNewEmail] = useState("");
  const [linkTarget, setLinkTarget] = useState("");

  const refresh = useCallback(async () => {
    const [deviceRes, linkRes] = await Promise.all([
      fetch("/api/household/devices", { credentials: "include" }),
      fetch("/api/household/links", { credentials: "include" }),
    ]);
    if (deviceRes.ok) setDevices((await deviceRes.json()).devices ?? []);
    if (linkRes.ok) setLinks((await linkRes.json()).links ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, householdId]);

  const post = async (url: string, body: unknown, method = "POST") => {
    setFormError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || "That did not work.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const enroll = async () => {
    const data = await post("/api/auth/enroll", enrollFor ? { userId: enrollFor } : {});
    if (!data) return;
    const target = members.find((member) => member.id === enrollFor);
    setCopyState("idle");
    // Build the link from this browser's origin: the API trusts the request
    // origin, which is 0.0.0.0 when the server is bound to every interface and
    // therefore useless to type into another device.
    setEnrollment({
      code: data.code,
      url: `${window.location.origin}/enroll#${data.code}`,
      forName: target?.name ?? "this tablet",
    });
  };

  const copySetupLink = async () => {
    if (!enrollment) return;
    const worked = await copyText(enrollment.url);
    setCopyState(worked ? "copied" : "failed");
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  };

  const revoke = async (deviceId: string) => {
    if (await post(`/api/household/devices/${deviceId}`, null, "DELETE")) await refresh();
  };

  const addMember = async () => {
    const data = await post("/api/household/members", {
      name: newName.trim(),
      role: newRole,
      email: newEmail.trim() || undefined,
    });
    if (!data) return;
    setNewName("");
    setNewEmail("");
    setMessage(`${data.user.name} can now be added with a picture code.`);
    await onChanged?.();
  };

  const savePin = async (value: string[]) => {
    if (!pinTarget) return;
    const data = await post(`/api/household/members/${pinTarget.id}/pin`, { pin: value });
    if (!data) {
      setPin([]);
      return;
    }
    setPinTarget(null);
    setPin([]);
    setMessage("Picture code saved.");
  };

  const tapPin = (emojiId: string) => {
    setPin((current) => {
      const next = [...current, emojiId].slice(0, PIN_LENGTH);
      if (next.length === PIN_LENGTH) void savePin(next);
      return next;
    });
  };

  const requestLink = async () => {
    const data = await post("/api/household/links", { householdId: linkTarget.trim() });
    if (!data) return;
    setLinkTarget("");
    setMessage("Link requested. The other household has to approve it.");
    await refresh();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone size={20} className="text-ink" />
        <h2 className="font-display text-xl font-bold text-ink">Tablets, codes &amp; links</h2>
      </div>

      {message ? <p className="text-sm font-medium text-ink/70">{message}</p> : null}
      {formError ? (
        <p className="text-sm font-medium text-coral" role="status">
          {formError}
        </p>
      ) : null}

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">Enroll this tablet</h3>
            <p className="text-sm text-ink/60">Creates a single-use code. The tablet stays signed in as a picker.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={enrollFor}
              onChange={(event) => setEnrollFor(event.target.value)}
              className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
              aria-label="Enroll for"
            >
              <option value="">A shared tablet</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}&apos;s own device
                </option>
              ))}
            </select>
            <Button onClick={enroll} disabled={busy} size="sm">
              <Plus size={14} className="inline mr-1" />
              Create code
            </Button>
          </div>
        </div>

        {enrollment ? (
          <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-cream p-4">
            <QrCode value={enrollment.url} />
            <div className="min-w-0">
              <p className="text-sm text-ink/60">For {enrollment.forName}. Expires in five minutes.</p>
              <p className="mt-2 break-all font-mono text-sm text-ink">{enrollment.url}</p>
              <button
                type="button"
                onClick={copySetupLink}
                aria-live="polite"
                className="mt-2 flex items-center gap-1 text-left text-sm font-medium text-coral hover:underline"
              >
                {copyState === "copied" ? (
                  <>
                    <Check size={14} aria-hidden />
                    Link copied
                  </>
                ) : copyState === "failed" ? (
                  "Could not copy. Select the link and copy it manually."
                ) : (
                  "Copy the setup link"
                )}
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-display text-lg font-bold text-ink">Signed-in devices</h3>
        {devices === null ? (
          <p className="text-sm text-ink/60">Loading.</p>
        ) : devices.length === 0 ? (
          <EmptyState icon={<Smartphone size={28} />} title="No devices yet" message="Enroll a tablet to keep a picker signed in." />
        ) : (
          <ul className="divide-y divide-ink/5">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {device.userName ?? "Shared tablet"}
                    <span className="ml-2 text-xs uppercase tracking-wide text-ink/40">{device.kind}</span>
                  </p>
                  <p className="truncate text-xs text-ink/50">
                    {device.label || "Unknown device"} · last used {new Date(device.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(device.id)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-coral hover:bg-coral/10"
                >
                  <Trash2 size={14} />
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-display text-lg font-bold text-ink">Add someone</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-40">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink/50">Name</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2"
              placeholder="Emma"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink/50">Role</span>
            <select
              value={newRole}
              onChange={(event) => setNewRole(event.target.value)}
              className="rounded-xl border border-ink/10 bg-white px-3 py-2"
            >
              <option value="child">Child</option>
              <option value="parent">Parent</option>
              <option value="helper">Helper</option>
            </select>
          </label>
          <label className="flex-1 min-w-48">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink/50">
              Email (13 and over only)
            </span>
            <input
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2"
              placeholder="Optional"
              type="email"
            />
          </label>
          <Button onClick={addMember} disabled={busy || !newName.trim()} size="sm">
            Add
          </Button>
        </div>
        <p className="text-xs text-ink/50">
          Under-13 members never need an email. Set a picture code so they can use the picker.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                setPinTarget(member);
                setPin([]);
              }}
              className="flex items-center gap-1 rounded-full bg-cream px-3 py-1 text-sm font-medium text-ink/70 hover:text-ink"
            >
              <KeyRound size={13} />
              {member.name}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 size={18} />
          <h3 className="font-display text-lg font-bold text-ink">Shared reports</h3>
        </div>
        <p className="text-sm text-ink/60">
          A link shares totals only: points, streaks, completion rates. Never chores, comments or photos.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-48">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink/50">Household id</span>
            <input
              value={linkTarget}
              onChange={(event) => setLinkTarget(event.target.value)}
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 font-mono text-sm"
              placeholder="household-…"
            />
          </label>
          <Button onClick={requestLink} disabled={busy || !linkTarget.trim()} size="sm">
            Request
          </Button>
        </div>

        {links === null ? (
          <p className="text-sm text-ink/60">Loading.</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-ink/60">No links yet.</p>
        ) : (
          <ul className="divide-y divide-ink/5">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{link.householdName}</p>
                  <p className="text-xs uppercase tracking-wide text-ink/40">
                    {link.status} · {link.direction}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {link.direction === "incoming" && link.status === "pending" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await post(`/api/household/links/${link.id}`, {})) await refresh();
                      }}
                      disabled={busy}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-green-700 hover:bg-green-50"
                    >
                      <Check size={14} />
                      Approve
                    </button>
                  ) : null}
                  {link.status !== "revoked" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await post(`/api/household/links/${link.id}`, null, "DELETE")) await refresh();
                      }}
                      disabled={busy}
                      className="rounded-lg px-2 py-1 text-sm font-medium text-coral hover:bg-coral/10"
                    >
                      Revoke
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pinTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Set a picture code for ${pinTarget.name}`}
        >
          <div className="w-full max-w-md rounded-3xl bg-cream p-6">
            <h3 className="font-display text-xl font-bold text-ink">Picture code for {pinTarget.name}</h3>
            <p className="mt-1 text-sm text-ink/60">Pick four pictures. Tap them in the same order next time.</p>
            <div className="mt-4 flex justify-center gap-2">
              {Array.from({ length: PIN_LENGTH }).map((_, index) => {
                const chosen = PIN_EMOJI.find((entry) => entry.id === pin[index]);
                return (
                  <span
                    key={index}
                    className="flex size-12 items-center justify-center rounded-xl bg-white text-xl shadow-sm"
                  >
                    {chosen ? chosen.glyph : ""}
                  </span>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-6 gap-1.5">
              {PIN_EMOJI.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => tapPin(entry.id)}
                  aria-label={entry.label}
                  className="flex aspect-square items-center justify-center rounded-lg bg-white text-xl shadow-sm hover:bg-white/70"
                >
                  {entry.glyph}
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPinTarget(null);
                  setPin([]);
                }}
              >
                Cancel
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPin([])}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
