"use client";
import { getSupabaseBrowser } from "@/supabase/client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PageShell, PageHeader, EmptyState, Loading, Badge, Button, Card } from "@/components/ui";
import { Star, Users, Plus, X } from "lucide-react";
import { getAvatarEmoji } from "@/lib/avatar";

interface Family {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  timezone: string;
  weekStartDay: number;
  teamsEnabled: boolean;
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

  const checkAuth = async () => {
    const { data: { session } } = await getSupabaseBrowser().auth.getSession();
    if (!session) {
      setIsAuthenticated(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setFamilyId(data.familyId || "");
        loadFamilyData(data.familyId);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setIsAuthenticated(false);
    }
  };

  const loadFamilyData = async (fid: string) => {
    setLoading(true);
    try {
      const [familyRes, usersRes, teamsRes] = await Promise.all([
        fetch(`/api/family?${new URLSearchParams({ id: fid })}`),
        fetch(`/api/users?familyId=${fid}`),
        fetch(`/api/teams?familyId=${fid}`),
      ]);

      const familyData = await familyRes.json();
      const usersData = await usersRes.json();
      const teamsData = await teamsRes.json();

      if (!familyData.ok || !usersData.ok) {
        throw new Error("Failed to load family data");
      }

      setFamily(familyData.family);
      setUsers(usersData.users);
      setTeams(teamsData.teams);
    } catch (error) {
      console.error("Failed to load family data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load family ID from storage or URL
  useEffect(() => {
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
    const storedFamilyId = typeof window !== "undefined" && localStorage.getItem("familyId");
    if (storedFamilyId) {
      setFamilyId(storedFamilyId);
      loadFamilyData(storedFamilyId);
    }
  }, []);

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyId || !isAuthenticated) return;

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
    } catch (error) {
      console.error("Failed to create family:", error);
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
    } catch (error) {
      console.error("Failed to join family:", error);
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
    } catch (error) {
      console.error("Failed to create team:", error);
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
    } catch (error) {
      console.error("Failed to assign user:", error);
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
    } catch (error) {
      console.error("Failed to toggle teams:", error);
      alert("Failed to update teams setting.");
    }
  };

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

  if (!family) {
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
        title={viewingFamily ? family.name : "Family Settings"}
        subtitle={viewingFamily ? `Welcome to ${family.name}!` : "Manage your family settings, teams, and members."}
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
              <div>
                <label className="block text-sm font-bold text-ink mb-1">Family Name</label>
                <p className="text-ink/60">{family.name}</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Timezone</label>
                <p className="text-ink/60">{family.timezone}</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Week Starts On</label>
                <p className="text-ink/60">
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][family.weekStartDay]}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Teams Enabled</label>
                <Badge 
                  status={family.teamsEnabled ? "done" : "todo"}
                >
                  {family.teamsEnabled ? "Yes ✓" : "No"}
                </Badge>
              </div>
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
        {family.teamsEnabled && (
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

                  {family.teamsEnabled && teams?.length > 0 && (
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
