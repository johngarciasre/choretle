"use client";
import { useState, useEffect } from "react";
import { PageShell, PageHeader, EmptyState, Loading, Badge, Button, Card } from "@/components/ui";
import { Star, Users, Plus, Pencil, Trash2, Tag as TagIcon } from "lucide-react";
import { getAvatarEmoji } from "@/lib/avatar";
import { error } from "@/lib/logger";
import { HouseholdAccessPanel } from "@/components/HouseholdAccessPanel";

interface Household {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  timezone: string;
  weekStartDay: number;
  createdAt: string;
}

interface Tag {
  id: string;
  householdId: string;
  name: string;
  color: string;
  taskCount?: number;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: string;
  householdId: string;
  pointsTotal: number;
}

export default function HouseholdPage() {
  // Create/Join household state
  const [isAuthenticated] = useState(true);
  const [householdId, setHouseholdId] = useState("");
  const [viewingHousehold, setViewingHousehold] = useState<string | null>(null);

  // Data loading states
  const [loading, setLoading] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Create form state
  const [name, setName] = useState("");
  const [weekStartDay] = useState(0);

  // Join form state
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  // Invite codes (join codes) management state
  const [invites, setInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [showGenerateCode, setShowGenerateCode] = useState(false);
  const [generatingPermanent, setGeneratingPermanent] = useState(false);

  // Tag management state
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#6366ee");

  // Member management state
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  // Name editing state
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState("");

  const checkAuth = async () => {
    // DEBUG: Skip auth, always return authenticated with householdId from URL
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.householdId) {
          setHouseholdId(data.householdId);
          setViewingHousehold(data.householdId);
          return;
        }
      }
    } catch (err) {
      error({ err }, "Auth check failed");
    }
  };

  const loadHouseholdData = async (fid: string) => {
    setLoading(true);
    try {
      const [householdRes, usersRes] = await Promise.all([
        fetch(`/api/household?${new URLSearchParams({ id: fid })}`, { credentials: "include" }),
        fetch(`/api/users?householdId=${fid}`, { credentials: "include" }),
      ]);

      const householdData = await householdRes.json();
      const usersData = await usersRes.json();

      if (!householdRes.ok || !usersRes.ok) {
        throw new Error(`Failed to load household data: household=${householdRes.status}, users=${usersRes.status}`);
      }

      setHousehold(householdData.household);
      setUsers(usersData.users);
    } catch (err) {
      error("Failed to load household data", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async (fid: string) => {
    setLoadingTags(true);
    try {
      const response = await fetch("/api/tags", {
        headers: { "x-household-id": fid },
      });
      if (response.ok) {
        const data = await response.json();
        setTags(data);
      }
    } catch (err) {
      error({ err: err }, "Failed to load tags");
    } finally {
      setLoadingTags(false);
    }
  };

  const loadInvites = async (fid?: string) => {
    const id = fid || householdId;
    if (!id) return;
    setLoadingInvites(true);
    try {
      const response = await fetch(`/api/household/join?householdId=${id}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setInvites(data.invites || []);
      }
    } catch (err) {
      error({ err }, "Failed to load invites");
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") document.title = "Choretle - Household";

    // Check auth first — if user has a household, redirect to viewing it
    checkAuth();

    // Load household data from the last segment of the URL
    const segments = typeof window !== "undefined" ? window.location.pathname.split("/").filter(Boolean) : [];
    const id = segments[segments.length > 1 ? segments.length - 1 : segments.length];
    if (id && id.startsWith("household-")) {
      setViewingHousehold(id);
      loadHouseholdData(id);
      loadTags(id);
      loadInvites(id);
    }
    // The loaders are component-scoped and would re-run the effect on every
    // render if listed here; ids are passed explicitly instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When checkAuth sets viewingHousehold, load the data
  useEffect(() => {
    if (viewingHousehold && !household) {
      loadHouseholdData(viewingHousehold);
      loadTags(viewingHousehold);
      loadInvites(viewingHousehold);
    }
    // Guarded by !household, so re-running when `household` arrives is a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingHousehold]);

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !name.trim()) return;

    try {
      const response = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, weekStartDay }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${response.status}`);
      }

      const data = await response.json();
      setHouseholdId(data.household.id);
      setViewingHousehold(data.household.id);
      localStorage.setItem("householdId", data.household.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      error({ err: err }, `Failed to create household: ${msg}`);
      alert(msg);
    }
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;

    try {
      const response = await fetch("/api/household/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to join household");

      const data = await response.json();
      setHouseholdId(data.household.id);
      setViewingHousehold(data.household.id);
      localStorage.setItem("householdId", data.household.id);

      // No router needed — component re-renders on householdId change
    } catch (err) {
      error({ err: err }, "Failed to join household");
      alert("Failed to join household. Please try again.");
    }
  };

  const handleCreateTag = async () => {
    if (!tagName.trim() || !householdId) return;

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to create tag");

      const newTag = await response.json();
      setTags([...tags, newTag]);
      setShowTagForm(false);
      setTagName("");
      setTagColor("#6366ee");
    } catch (err) {
      error({ err: err }, "Failed to create tag");
      alert("Failed to create tag.");
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !tagName.trim()) return;

    try {
      const response = await fetch("/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingTag.id, name: tagName.trim(), color: tagColor }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to update tag");

      const updatedTag = await response.json();
      setTags(tags.map(t => t.id === updatedTag.id ? updatedTag : t));
      setEditingTag(null);
      setShowTagForm(false);
      setTagName("");
      setTagColor("#6366ee");
    } catch (err) {
      error({ err: err }, "Failed to update tag");
      alert("Failed to update tag.");
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm("Delete this tag? This cannot be undone.")) return;

    try {
      const response = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tagId }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete tag");

      setTags(tags.filter(t => t.id !== tagId));
    } catch (err) {
      error({ err: err }, "Failed to delete tag");
      alert("Failed to delete tag.");
    }
  };

  const handleUpdateHouseholdName = async () => {
    if (!householdId || !tempName.trim()) return;

    try {
      const response = await fetch(`/api/household/${householdId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tempName.trim() }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to update household name");

      const data = await response.json();
      setHousehold((prev) => (prev ? { ...prev, name: data.name } : prev));
      setEditingName(false);
    } catch (err) {
      error({ err: err }, "Failed to update household name");
      alert("Failed to update household name.");
    }
  };

  const handleToggleMemberRole = async (userId: string, currentRole: string) => {
    if (!householdId || !viewingHousehold) return;
    const newRole = currentRole === "parent" ? "child" : "parent";

    try {
      const response = await fetch(`/api/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to update member role");

      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      error({ err }, "Failed to toggle member role");
      alert("Failed to update member role.");
    }
  };

  const handleDeleteMember = async (userId: string, userName: string) => {
    if (!confirm(`Remove "${userName}" from this household?`)) return;

    try {
      const response = await fetch(`/api/users`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete member");

      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      error({ err }, "Failed to delete member");
      alert("Failed to remove member.");
    }
  };

  const handleGenerateInvite = async () => {
    if (!householdId) return;
    try {
      const response = await fetch("/api/household/join/generate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permanent: generatingPermanent }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to generate invite");

      const data = await response.json();
      setInvites((prev) => [data.invite, ...prev]);
      setShowGenerateCode(false);
      setGeneratingPermanent(false);
    } catch (err) {
      error({ err }, "Failed to generate invite");
      alert("Failed to generate invite code.");
    }
  };

  const handleInvalidateInvite = async (inviteId: string, code: string) => {
    if (!confirm(`Revoke the code "${code}"?`)) return;
    try {
      const response = await fetch(`/api/household/join/${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to invalidate invite");

      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      error({ err }, "Failed to invalidate invite");
      alert("Failed to revoke invite code.");
    }
  };

  const formatExpiry = (expiresAt: string | null): string => {
    if (!expiresAt) return "Permanent";
    const date = new Date(expiresAt);
    if (date < new Date()) return "Expired";
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Expires today";
    if (days === 1) return "Expires tomorrow";
    if (days < 30) return `Expires in ${days} days`;
    const months = Math.floor(days / 30);
    return `Expires in ${months} month${months > 1 ? "s" : ""}`;
  };

  // DEBUG: No auth guard — render immediately
  if (loading) {
    return (
      <PageShell>
        <Loading label="Loading household..." />
      </PageShell>
    );
  }

  if (!household && !viewingHousehold) {
    // User is authenticated but has no household — show create/join forms
    if (isAuthenticated) {
      return (
        <PageShell>
          <PageHeader 
            title="Welcome to Choretle!"
            subtitle="Create a household or join an existing one to get started."
          />

          <main className="space-y-8">
            <Card accent="coral" className="p-6 space-y-4">
              <form onSubmit={handleCreateHousehold} className="space-y-3">
                <input
                  type="text"
                  placeholder="Enter household name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-coral focus:outline-none"
                />
                <Button 
                  type="submit" 
                  variant="primary" 
                  size="lg"
                  className="w-full"
                  disabled={!name.trim()}
                >
                  Create Household
                </Button>
              </form>

              <div className="pt-4 border-t border-ink/10">
                <p className="text-sm text-ink/60 mb-3 text-center">or</p>
                <button
                  onClick={() => setShowJoin(true)}
                  className="w-full py-2 font-bold text-grape hover:text-grape/80"
                >
                  Join an existing household
                </button>
              </div>
            </Card>

            {showJoin && (
              <Card accent="grape" className="p-6 space-y-3">
                <form onSubmit={handleJoinHousehold} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter household join code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    required
                    className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-grape focus:outline-none"
                  />
                  <Button 
                    type="submit" 
                    variant="grape" 
                    size="lg"
                    className="w-full"
                    disabled={!joinCode.trim()}
                  >
                    Join Household
                  </Button>
                </form>
              </Card>
            )}
          </main>
        </PageShell>
      );
    }

    return (
      <PageShell>
        <main className="flex items-center justify-center min-h-[60vh]">
          <EmptyState 
            icon={<Star size={32} className="text-grape" />}
            title="Household Not Found"
            message="Sorry, we couldn&apos;t find this household."
          />
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader 
        title={viewingHousehold ? household?.name ?? "Household Settings" : "Household Settings"}
        subtitle={viewingHousehold ? `Welcome to ${household?.name}!` : "Manage your household settings and members."}
        actions={
          viewingHousehold && (
            <Button variant="grape" href="/dashboard">
              Back to Dashboard
            </Button>
          )
        }
      />

      <main className="space-y-8">
        {/* Household Settings */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Household Settings</h2>
          
          <Card accent="coral" className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Household Name */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1 flex items-center gap-2">
                  Household Name
                  {viewingHousehold && !editingName && (
                    <button onClick={() => { setTempName(household?.name || ""); setEditingName(true); }} className="text-xs text-ink/40 hover:text-ink/70">
                      <Pencil size={12} />
                    </button>
                  )}
                </label>
                {editingName ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleUpdateHouseholdName(); if (e.key === "Escape") setEditingName(false); }}
                      className="flex-1 rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-coral focus:outline-none"
                      autoFocus
                    />
                    <Button onClick={handleUpdateHouseholdName} size="sm" variant="primary">Save</Button>
                  </div>
                ) : (
                  <p className="text-ink/60">{household?.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Timezone</label>
                <p className="text-ink/60">{household?.timezone}</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Week Starts On</label>
                <p className="text-ink/60">
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][household?.weekStartDay ?? 0]}
                </p>
              </div>

            </div>

            {!viewingHousehold && (
              <div className="pt-4 border-t border-ink/10">
                <p className="text-sm text-ink/60 mb-3">Create a new household to get started!</p>
                <form onSubmit={handleCreateHousehold} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter household name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={!!viewingHousehold}
                    className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-coral focus:outline-none disabled:opacity-50"
                  />
                  <Button 
                    type="submit" 
                    variant="primary" 
                    size="lg"
                    className="w-full"
                    disabled={!name.trim() || !!viewingHousehold}
                  >
                    Create Household
                  </Button>
                </form>
              </div>
            )}
          </Card>
        </section>

        {/* Tags Section */}
        {viewingHousehold && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-display text-xl font-bold text-ink flex items-center gap-2">
                <TagIcon size={20} />
                Tags
              </h2>
              <Button onClick={() => { setEditingTag(null); setShowTagForm(true); }} variant="success" size="sm">
                <Plus size={16} className="inline mr-1" />
                Add Tag
              </Button>
            </div>

            {loadingTags ? (
              <Card accent="bubblegum" className="p-8 text-center">
                <p className="text-sm text-ink/60">Loading tags...</p>
              </Card>
            ) : tags.length === 0 ? (
              <Card accent="bubblegum" className="p-8 text-center">
                <EmptyState 
                  icon={<TagIcon size={32} />}
                  title="No Tags Yet"
                  message="Create tags to organize your tasks and slates!"
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tags.map((tag) => (
                  <Card 
                    key={tag.id} 
                    accent={tag.color ? "coral" : "grape"}
                    className="space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {tag.color && (
                          <span 
                            className="w-6 h-6 rounded-full border border-ink/15" 
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        <h3 className="font-display text-lg font-bold text-ink flex-1">
                          {tag.name}
                        </h3>
                      </div>
                      <span className="text-xs text-ink/60">
                        {(tag as any).taskCount || 0} tasks
                      </span>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-ink/10">
                      <button
                        onClick={() => { setEditingTag(tag); setTagName(tag.name); setTagColor(tag.color || "#6366ee"); setShowTagForm(true); }}
                        className="flex-1 text-xs font-bold text-ink/60 hover:text-ink/90"
                      >
                        <Pencil size={12} className="inline mr-1" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="flex-1 text-xs font-bold text-red-500/60 hover:text-red-500"
                      >
                        <Trash2 size={12} className="inline mr-1" /> Delete
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Tag Form Modal */}
            {showTagForm && (
              <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-[60] p-4">
                <Card accent="sunny" className="max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                  <h3 className="font-display text-2xl font-bold text-ink mb-6 flex items-center gap-2">
                    <TagIcon size={24} />
                    {editingTag ? "Edit Tag" : "Create New Tag"}
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Tag Name</label>
                      <input
                        type="text"
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        placeholder="Enter tag name"
                        className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-sunny focus:outline-none"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={tagColor}
                          onChange={(e) => setTagColor(e.target.value)}
                          className="w-8 h-8 rounded-full border border-ink/15 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={tagColor}
                          onChange={(e) => setTagColor(e.target.value)}
                          placeholder="#6366ee"
                          className="flex-1 rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-sunny focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        onClick={editingTag ? handleUpdateTag : handleCreateTag}
                        disabled={!tagName.trim()}
                        variant="success"
                        size="lg"
                        className="flex-1"
                      >
                        {editingTag ? "Update Tag" : "Create Tag"}
                      </Button>
                      <Button
                        onClick={() => { setShowTagForm(false); setEditingTag(null); setTagName(""); setTagColor("#6366ee"); }}
                        variant="ghost"
                        size="lg"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </section>
        )}

        {/* Join Codes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Join Codes</h2>
            <Button variant="primary" size="sm" onClick={() => setShowGenerateCode(!showGenerateCode)}>
              {showGenerateCode ? "Cancel" : "+ Generate Code"}
            </Button>
          </div>

          {/* Generate code form */}
          {showGenerateCode && (
            <Card accent="grape" className="p-6 space-y-3">
              <p className="text-sm text-ink/70 font-bold">Generate a new join code</p>
              <label className="flex items-center gap-2 text-sm font-bold text-ink/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generatingPermanent}
                  onChange={(e) => setGeneratingPermanent(e.target.checked)}
                  className="size-5 accent-grape"
                />
                Make this code permanent (no expiry)
              </label>
              <Button onClick={handleGenerateInvite} variant="primary" size="lg" className="w-full">
                Generate Code
              </Button>
            </Card>
          )}

          {/* List of join codes */}
          {loadingInvites ? (
            <Card accent="grape" className="p-6 text-center">
              <p className="text-sm text-ink/60">Loading join codes...</p>
            </Card>
          ) : invites.length === 0 ? (
            <Card accent="grape" className="p-6 text-center">
              <EmptyState 
                icon={<span className="text-2xl">🔗</span>}
                title="No Join Codes Yet"
                message="Generate a join code to share with household members."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {invites.map((invite) => {
                const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
                const isPermanent = !invite.expires_at;
                return (
                  <Card key={invite.id} accent={isExpired ? "coral" : isPermanent ? "sunny" : "grape"} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <code className="text-lg font-bold text-grape">{invite.code}</code>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-bold ${isExpired ? "text-coral" : isPermanent ? "text-sunny" : "text-ink/60"}`}>
                            {formatExpiry(invite.expires_at)}
                          </span>
                          {invite.used && (
                            <span className="text-teal font-bold">✓ Used</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleInvalidateInvite(invite.id, invite.code)}
                        className="px-3 py-1.5 rounded-lg text-sm font-bold text-coral hover:bg-coral/10 transition"
                        title="Revoke this code"
                      >
                        Revoke
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Household Members */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-xl font-bold text-ink flex items-center gap-2">
              <Users size={20} />
              Household Members
            </h2>
          </div>

          {(users ?? []).length === 0 ? (
            <Card accent="grape" className="p-8 text-center">
              <EmptyState
                icon={<Users size={32} />}
                title="No Household Members Yet"
                message="Add household members to get started with chore assignments!"
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((user) => (
                <Card key={user.id} accent="coral" className="space-y-3">
                  <div className="flex items-center gap-3 mb-3">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full object-cover object-top" />
                    ) : user.id ? (() => {
                        const e = getAvatarEmoji(user.id);
                        return (
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${e.bgClass}`}>
                            {e.emoji}
                          </div>
                        );
                      })() : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold bg-coral/15 text-coral">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-lg font-bold text-ink truncate">{user.name}</h3>
                      <p className="text-sm text-ink/60 truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-ink/60">Role:</span>
                      {viewingHousehold && (
                        <button
                          onClick={() => handleToggleMemberRole(user.id, user.role)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                            user.role === "parent"
                              ? "bg-teal/20 text-teal hover:bg-teal/30"
                              : "bg-sunny/20 text-sunny hover:bg-sunny/30"
                          }`}
                          title={user.role === "parent" ? "Click to make child" : "Click to make parent"}
                        >
                          {user.role === "parent" ? "👨‍💼 Parent" : "👦 Child"}
                        </button>
                      )}
                      {!viewingHousehold && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          user.role === "parent" ? "bg-teal/20 text-teal" : "bg-sunny/20 text-sunny"
                        }`}>
                          {user.role}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink/60">Total Points:</span>
                      <Badge status="points">
                        {user.pointsTotal.toLocaleString()} pts
                      </Badge>
                    </div>
                  </div>

                  {/* Delete member button */}
                  {viewingHousehold && users.length > 1 && (
                    <div className="pt-3 border-t border-ink/10">
                      {deletingMemberId === user.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteMember(user.id, user.name)}
                            className="flex-1 text-xs font-bold text-coral hover:text-coral/80 px-3 py-2 rounded-lg bg-coral/10 transition"
                          >
                            Confirm Remove
                          </button>
                          <button
                            onClick={() => setDeletingMemberId(null)}
                            className="flex-1 text-xs font-bold text-ink/60 hover:text-ink/90 px-3 py-2 rounded-lg transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingMemberId(user.id)}
                          className="w-full text-xs font-bold text-coral/60 hover:text-coral hover:bg-coral/10 px-3 py-2 rounded-lg transition"
                        >
                          Remove member
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {viewingHousehold ? (
          <HouseholdAccessPanel
            householdId={viewingHousehold}
            members={users}
            onChanged={() => loadHouseholdData(viewingHousehold)}
          />
        ) : null}
      </main>

    </PageShell>
  );
}
