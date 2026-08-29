"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PageShell, PageHeader, EmptyState, Loading, PageLoader, Badge, Button, Card } from "@/components/ui";
import { Star, Users, Plus, X, Pencil, Trash2, Tag as TagIcon } from "lucide-react";
import { getAvatarEmoji } from "@/lib/avatar";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

interface Family {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  timezone: string;
  weekStartDay: number;
  theme: string;
  teamsEnabled: boolean;
  createdAt: string;
}

interface Tag {
  id: string;
  familyId: string;
  name: string;
  color: string;
  taskCount?: number;
  createdAt: string;
}

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  createdAt: string;
  members?: TeamMember[];
}

interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  joinedAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: string;
  familyId: string;
  pointsTotal: number;
}

export default function FamilyPage() {
  const authChecked = useAuthRedirect();
  const pathname = usePathname();
  const router = useRouter();
  
  // Create/Join family state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [familyId, setFamilyId] = useState("");
  const [viewingFamily, setViewingFamily] = useState<string | null>(null);

  // Data loading states
  const [loading, setLoading] = useState(false);
  const [family, setFamily] = useState<Family | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // Create form state
  const [name, setName] = useState("");
  const [weekStartDay, setWeekStartDay] = useState(0);

  // Join form state
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  // Invite codes (join codes) management state
  const [invites, setInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [showGenerateCode, setShowGenerateCode] = useState(false);
  const [generatingPermanent, setGeneratingPermanent] = useState(false);

  // Team management state
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLogoUrl, setNewTeamLogoUrl] = useState("");
  const [selectedTeamForMembers, setSelectedTeamForMembers] = useState<string>("");

  // User selection for team assignment
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Toggle teams enabled state
  const [showToggleModal, setShowToggleModal] = useState(false);
  const [enableTeams, setEnableTeams] = useState(true);

  // Tag management state
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#6366ee");

  // Name editing state
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState("");

  // Theme selection state
  const [selectedTheme, setSelectedTheme] = useState(family?.theme || "coral");

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          setFamilyId(data.familyId || "");
          if (data.familyId) {
            loadFamilyData(data.familyId);
          }
          return;
        }
      }
      setIsAuthenticated(false);
    } catch (err) {
      error({ err }, "Auth check failed");
      setIsAuthenticated(false);
    }
  };

  const loadFamilyData = async (fid: string) => {
    setLoading(true);
    try {
      const [familyRes, usersRes, teamsRes] = await Promise.all([
        fetch(`/api/family?${new URLSearchParams({ id: fid })}`, { credentials: "include" }),
        fetch(`/api/users?familyId=${fid}`, { credentials: "include" }),
        fetch(`/api/teams?familyId=${fid}`, { credentials: "include" }),
      ]);

      const familyData = await familyRes.json();
      const usersData = await usersRes.json();
      const teamsData = await teamsRes.json();

      if (!familyData.ok || !usersData.ok) {
        throw new Error(`Failed to load family data: family=${familyRes.status}, users=${usersRes.status}`);
      }

      setFamily(familyData.family);
      setSelectedTheme(familyData.family.theme || "coral");
      setUsers(usersData.users);
      setTeams(teamsData.teams);
    } catch (err) {
      error("Failed to load family data", err);
    } finally {
      setLoading(false);
    }
  };

  // Load family ID from storage or URL
  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Family");
    if (pathname.startsWith("/family/")) {
      // Viewing a specific family
      const id = pathname.split("/").pop();
      if (id) {
        loadFamilyData(id);
        setViewingFamily(id);
      }
    } else if (pathname === "/family") {
      // Create/join view
      checkAuth();
    }
  }, [pathname]);

  useEffect(() => {
    if (viewingFamily) {
      loadTags(viewingFamily);
      loadInvites();
    }
  }, [viewingFamily]);

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !name.trim()) return;

    try {
      const response = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, weekStartDay }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to create family");

      const data = await response.json();
      setFamilyId(data.family.id);
      localStorage.setItem("familyId", data.family.id);
      
      // Redirect to the new family view
      router.push(`/family/${data.family.id}`);
    } catch (err) {
      error({ err: err }, "Failed to create family");
      alert("Failed to create family. Please try again.");
    }
  };

  const handleJoinFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;

    try {
      const response = await fetch("/api/family/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to join family");

      const data = await response.json();
      setFamilyId(data.family.id);
      localStorage.setItem("familyId", data.family.id);
      
      router.push(`/family/${data.family.id}`);
    } catch (err) {
      error({ err: err }, "Failed to join family");
      alert("Failed to join family. Please try again.");
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName || !familyId) return;

    try {
      const response = await fetch(`/api/family/${familyId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName, logoUrl: newTeamLogoUrl || undefined }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to create team");

      const data = await response.json();
      setTeams([...teams, data.team]);
      setShowTeamForm(false);
      setNewTeamName("");
      setNewTeamLogoUrl("");
    } catch (err) {
      error({ err: err }, "Failed to create team");
      alert("Failed to create team.");
    }
  };

  const handleAssignUserToTeam = async () => {
    if (!selectedUser || !selectedTeamForMembers || !familyId) return;

    try {
      const response = await fetch(`/api/family/${familyId}/teams/${selectedTeamForMembers}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser.id }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to assign user to team");

      // Refresh teams data
      const teamsRes = await fetch(`/api/teams?familyId=${familyId}`);
      const teamsData = await teamsRes.json();
      setTeams(teamsData.teams);

      setSelectedUser(null);
      alert(`Successfully assigned ${selectedUser.name} to team!`);
    } catch (err) {
      error({ err: err }, "Failed to assign user");
      alert("Failed to assign user to team.");
    }
  };

  const handleToggleTeamsEnabled = async () => {
    if (!familyId) return;

    try {
      const response = await fetch(`/api/family/${familyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamsEnabled: enableTeams }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to update family settings");

      const data = await response.json();
      setFamily(data.family);
      setShowToggleModal(false);
    } catch (err) {
      error({ err: err }, "Failed to toggle teams");
      alert("Failed to update teams setting.");
    }
  };

  const loadTags = async (fid: string) => {
    setLoadingTags(true);
    try {
      const response = await fetch("/api/tags", {
        headers: { "x-family-id": fid },
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

  const handleCreateTag = async () => {
    if (!tagName.trim() || !familyId) return;

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

  const handleUpdateFamilyName = async () => {
    if (!familyId || !tempName.trim()) return;

    try {
      const response = await fetch(`/api/family/${familyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tempName.trim() }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to update family name");

      const data = await response.json();
      setFamily(data.family);
      setEditingName(false);
    } catch (err) {
      error({ err: err }, "Failed to update family name");
      alert("Failed to update family name.");
    }
  };

  const handleUpdateTheme = async () => {
    if (!familyId) return;

    try {
      const response = await fetch(`/api/family/${familyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: selectedTheme }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to update theme");

      const data = await response.json();
      setFamily(data.family);
      setSelectedTheme(data.family.theme || selectedTheme);
    } catch (err) {
      error({ err: err }, "Failed to update theme");
      alert("Failed to update theme.");
    }
  };

  const loadInvites = async () => {
    if (!familyId) return;
    setLoadingInvites(true);
    try {
      const response = await fetch(`/api/family/join?familyId=${familyId}`);
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

  const handleGenerateInvite = async () => {
    if (!familyId) return;
    try {
      const response = await fetch("/api/family/join/generate-code", {
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
      const response = await fetch(`/api/family/join/${encodeURIComponent(code)}`, {
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

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;

  if (!isAuthenticated && pathname.startsWith("/family/")) {
    return (
      <PageShell>
        <main className="flex items-center justify-center min-h-[60vh]">
          <EmptyState 
            icon={<Star size={32} className="text-grape" />}
            title="Welcome to Choretle!"
            message="Create a family or join an existing one to get started."
          />
        </main>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <Loading label="Loading family..." />
      </PageShell>
    );
  }

  if (!family && !viewingFamily) {
    // User is authenticated but has no family — show create/join forms
    if (isAuthenticated) {
      return (
        <PageShell>
          <PageHeader 
            title="Welcome to Choretle!"
            subtitle="Create a family or join an existing one to get started."
          />

          <main className="space-y-8">
            <Card accent="coral" className="p-6 space-y-4">
              <form onSubmit={handleCreateFamily} className="space-y-3">
                <input
                  type="text"
                  placeholder="Enter family name"
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
                  Create Family
                </Button>
              </form>

              <div className="pt-4 border-t border-ink/10">
                <p className="text-sm text-ink/60 mb-3 text-center">or</p>
                <button
                  onClick={() => setShowJoin(true)}
                  className="w-full py-2 font-bold text-grape hover:text-grape/80"
                >
                  Join an existing family
                </button>
              </div>
            </Card>

            {showJoin && (
              <Card accent="grape" className="p-6 space-y-3">
                <form onSubmit={handleJoinFamily} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter family join code"
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
                    Join Family
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
            title="Family Not Found"
            message="Sorry, we couldn&apos;t find this family."
          />
        </main>
      </PageShell>
    );
  }

  const accentColors = [
    { name: "coral", border: "border-coral", bg: "bg-coral/15" },
    { name: "teal", border: "border-teal", bg: "bg-teal/15" },
    { name: "sunny", border: "border-sunny", bg: "bg-sunny/15" },
    { name: "grape", border: "border-grape", bg: "bg-grape/15" },
    { name: "bubblegum", border: "border-bubblegum", bg: "bg-bubblegum/15" },
  ];

  return (
    <PageShell>
      <PageHeader 
        title={viewingFamily ? family?.name ?? "Family Settings" : "Family Settings"}
        subtitle={viewingFamily ? `Welcome to ${family?.name}!` : "Manage your family settings, teams, and members."}
        actions={
          viewingFamily && (
            <Button variant="grape" href="/dashboard">
              Back to Dashboard
            </Button>
          )
        }
      />

      <main className="space-y-8">
        {/* Family Settings */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Family Settings</h2>
          
          <Card accent="coral" className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Family Name */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1 flex items-center gap-2">
                  Family Name
                  {viewingFamily && !editingName && (
                    <button onClick={() => { setTempName(family?.name || ""); setEditingName(true); }} className="text-xs text-ink/40 hover:text-ink/70">
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
                      onKeyDown={(e) => { if (e.key === "Enter") handleUpdateFamilyName(); if (e.key === "Escape") setEditingName(false); }}
                      className="flex-1 rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-coral focus:outline-none"
                      autoFocus
                    />
                    <Button onClick={handleUpdateFamilyName} size="sm" variant="primary">Save</Button>
                  </div>
                ) : (
                  <p className="text-ink/60">{family?.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Timezone</label>
                <p className="text-ink/60">{family?.timezone}</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Week Starts On</label>
                <p className="text-ink/60">
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][family?.weekStartDay ?? 0]}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Teams Enabled</label>
                <Badge 
                  status={family?.teamsEnabled ? "done" : "todo"}
                >
                  {family?.teamsEnabled ? "Yes ✓" : "No"}
                </Badge>
              </div>

              {/* Theme Selector */}
              {viewingFamily && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-ink mb-1 flex items-center gap-2">
                    Family Theme
                    {!editingName && (
                      <button onClick={handleUpdateTheme} className="text-xs text-grape hover:text-grape/80 ml-auto">
                        Save
                      </button>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: "coral", bg: "bg-coral" },
                      { name: "teal", bg: "bg-teal" },
                      { name: "sunny", bg: "bg-sunny" },
                      { name: "grape", bg: "bg-grape" },
                      { name: "bubblegum", bg: "bg-bubblegum" },
                    ].map((t) => (
                      <button
                        key={t.name}
                        onClick={() => setSelectedTheme(t.name)}
                        className={`w-8 h-8 rounded-full ${t.bg} border-2 transition-all ${selectedTheme === t.name ? "border-ink scale-110" : "border-ink/15 hover:border-ink/30"}`}
                        title={t.name}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!viewingFamily && (
              <div className="pt-4 border-t border-ink/10">
                <p className="text-sm text-ink/60 mb-3">Create a new family to get started!</p>
                <form onSubmit={handleCreateFamily} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter family name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={!!viewingFamily}
                    className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-coral focus:outline-none disabled:opacity-50"
                  />
                  <Button 
                    type="submit" 
                    variant="primary" 
                    size="lg"
                    className="w-full"
                    disabled={!name.trim() || !!viewingFamily}
                  >
                    Create Family
                  </Button>
                </form>
              </div>
            )}

            {viewingFamily && (
              <div>
                <p className="text-sm text-ink/60 mb-3">Join an existing family with a code!</p>
                <form onSubmit={handleJoinFamily} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter family join code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    required={!viewingFamily}
                    disabled={!!viewingFamily}
                    className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-grape focus:outline-none disabled:opacity-50"
                  />
                  <Button 
                    type="submit" 
                    variant="grape" 
                    size="lg"
                    className="w-full"
                    disabled={!joinCode.trim() || !!viewingFamily}
                  >
                    Join Family
                  </Button>
                </form>
              </div>
            )}
          </Card>
        </section>

        {/* Teams Section */}
        {family?.teamsEnabled && (
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-display text-xl font-bold text-ink">Teams</h2>
              {!viewingFamily && (
                <Button onClick={() => setShowTeamForm(true)} variant="success" size="sm">
                  <Plus size={16} className="inline mr-1" />
                  Create Team
                </Button>
              )}
            </div>

            {teams.length === 0 ? (
              <Card accent="bubblegum" className="p-8 text-center">
                <EmptyState 
                  icon={<Users size={32} />}
                  title="No Teams Yet"
                  message="Create your first team to organize your family members!"
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map((team, index) => (
                  <Card 
                    key={team.id} 
                    accent={accentColors[index % accentColors.length].name as any}
                    className="space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <h3 className={`font-display text-xl font-bold ${accentColors[index % accentColors.length].border}`}>
                        {team.name}
                      </h3>
                      <span className="text-xs text-ink/60">
                        {new Date(team.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Team Members */}
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-ink/60">Members:</p>
                      {(team as any)?.members?.length > 0 ? (
                        ((team as any).members as TeamMember[]).map((member: TeamMember) => {
                          const user = users.find(u => u.id === member.userId);
                          const accentIndex = index % accentColors.length;
                          return (
                            <div 
                              key={member.id} 
                              className={`flex items-center gap-2 ${accentColors[accentIndex].bg} rounded-full px-3 py-1.5 text-sm font-bold`}
                            >
                              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs">
                                {user?.name.charAt(0).toUpperCase()}
                              </span>
                              {user?.name || "Unknown User"}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-ink/60">No members yet</p>
                      )}
                    </div>

                    {/* Add Member Form */}
                    {(team as any)?.members?.length > 0 && !viewingFamily && (
                      <div className="pt-3 border-t border-ink/10 space-y-2">
                        <select
                          value={selectedTeamForMembers || ""}
                          onChange={(e) => setSelectedTeamForMembers(e.target.value)}
                          className="text-sm rounded-xl border-2 border-ink/15 bg-white px-3 py-2 font-bold text-ink focus:border-grape focus:outline-none"
                        >
                          <option value="">Select team...</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>

                        <select
                          value={selectedUser?.id || ""}
                          onChange={(e) => setSelectedUser(users.find(u => u.id === e.target.value) || null)}
                          className="text-sm rounded-xl border-2 border-ink/15 bg-white px-3 py-2 font-bold text-ink focus:border-grape focus:outline-none"
                        >
                          <option value="">Select user...</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>

                        <Button
                          onClick={handleAssignUserToTeam}
                          disabled={!selectedUser || !selectedTeamForMembers}
                          variant="primary"
                          size="sm"
                          className="w-full"
                        >
                          Assign User
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {/* Create Team Modal */}
            {showTeamForm && !viewingFamily && (
              <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-[60] p-4">
                <Card accent="sunny" className="max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                  <h3 className="font-display text-2xl font-bold text-ink mb-6 flex items-center gap-2">
                    <Plus size={24} />
                    Create New Team
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Team Name</label>
                      <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="Enter team name"
                        className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-sunny focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Logo URL (optional)</label>
                      <input
                        type="text"
                        value={newTeamLogoUrl}
                        onChange={(e) => setNewTeamLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-2.5 font-bold text-ink placeholder:text-ink/40 focus:border-sunny focus:outline-none"
                      />
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        onClick={handleCreateTeam}
                        disabled={!newTeamName.trim()}
                        variant="success"
                        size="lg"
                        className="flex-1"
                      >
                        Create Team
                      </Button>
                      <Button
                        onClick={() => setShowTeamForm(false)}
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

        {/* Tags Section */}
        {viewingFamily && (
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
                message="Generate a join code to share with family members."
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

        {/* Family Members */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-ink">Family Members</h2>

          {users.length === 0 ? (
            <Card accent="grape" className="p-8 text-center">
              <EmptyState 
                icon={<Users size={32} />}
                title="No Family Members Yet"
                message="Add family members to get started with chore assignments!"
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((user) => (
                <Card key={user.id} accent="coral" className="space-y-3">
                  <div className="flex items-center gap-3 mb-3">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
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
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink">{user.name}</h3>
                      <p className="text-sm text-ink/60">{user.email}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-ink/60">Role:</span>
                      <span className="font-bold text-ink capitalize">{user.role}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink/60">Total Points:</span>
                      <Badge status="points">
                        {user.pointsTotal.toLocaleString()} pts
                      </Badge>
                    </div>
                  </div>

                  {family?.teamsEnabled && teams?.length > 0 && (
                    <div className="pt-3 border-t border-ink/10">
                      <p className="text-sm font-bold text-ink/60 mb-2">Teams:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(teams as any[]).filter((t: Team) => {
                          const teamWithMembers = (teams as any[]).find((tm: Team) => 
                            tm.members?.some((m: TeamMember) => m.userId === user.id)
                          );
                          return teamWithMembers && teamWithMembers.name === t.name;
                        }).map((team: Team) => (
                          <Badge key={team.id} status="neutral">
                            {team.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Teams Toggle Modal */}
      {showToggleModal && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-[60] p-4">
          <Card accent="grape" className="max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="font-display text-2xl font-bold text-ink mb-6">Toggle Teams</h3>
            
            <div className="flex items-center gap-4 mb-6">
              <input
                type="checkbox"
                id="teamsEnabled"
                checked={enableTeams}
                onChange={(e) => setEnableTeams(e.target.checked)}
                className="w-5 h-5 text-grape rounded focus:ring-grape"
              />
              <label htmlFor="teamsEnabled" className="text-lg font-bold text-ink">
                Enable team management
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleToggleTeamsEnabled}
                variant="grape"
                size="lg"
                className="flex-1"
              >
                Save Changes
              </Button>
              <Button
                onClick={() => setShowToggleModal(false)}
                variant="ghost"
                size="lg"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
