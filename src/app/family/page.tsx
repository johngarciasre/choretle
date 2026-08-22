"use client";
import { getSupabaseBrowser } from "@/supabase/client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
      // Fetch family data
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <div className="space-y-6 p-8 rounded-lg shadow-lg w-full max-w-md">
          <h1 className="text-3xl font-bold text-center">Welcome to Choretle</h1>

          <form onSubmit={handleCreateFamily} className="space-y-4">
            <input
              type="text"
              placeholder="Family name"
              value={familyId || ""}
              onChange={(e) => setFamilyId(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-lg"
            />
            <button 
              type="submit" 
              className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              disabled={!familyId}
            >
              Create Family
            </button>
          </form>

          <div className="text-center">
            <button onClick={() => router.push("/family")} className="text-indigo-600 underline">
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <p className="text-lg text-gray-500">Family not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-sm text-gray-600 dark:text-gray-300">Back to Dashboard</span>
        </Link>
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{family.name}</h1>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Family Settings */}
        <section className="bg-white/90 dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Family Settings</h2>
            <button
              onClick={() => setShowToggleModal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
            >
              Toggle Teams
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Family Name</label>
              <p className="text-gray-600 dark:text-gray-300">{family.name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <p className="text-gray-600 dark:text-gray-300">{family.timezone}</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Week Starts On</label>
              <p className="text-gray-600 dark:text-gray-300">
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][family.weekStartDay]}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Teams Enabled</label>
              <p className={`text-${family.teamsEnabled ? "green" : "gray"}-600 dark:text-${family.teamsEnabled ? "green" : "gray"}-400`}>
                {family.teamsEnabled ? "Yes" : "No"}
              </p>
            </div>
          </div>

          {/* Teams Toggle Modal */}
          {showToggleModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-xl font-semibold mb-4">Toggle Teams</h3>
                
                <div className="flex items-center gap-4 mb-6">
                  <input
                    type="checkbox"
                    id="teamsEnabled"
                    checked={enableTeams}
                    onChange={(e) => setEnableTeams(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="teamsEnabled" className="text-lg">
                    Enable team management
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleToggleTeamsEnabled}
                    className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setShowToggleModal(false)}
                    className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Teams Section */}
        {family.teamsEnabled && (
          <section className="bg-white/90 dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Teams</h2>
              <button
                onClick={() => setShowTeamForm(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                + Create Team
              </button>
            </div>

            {teams.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No teams yet. Create your first team!</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {teams.map((team) => (
                  <div key={team.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{team.name}</h3>
                      <span className="text-xs text-gray-500">
                        {new Date(team.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Team Members */}
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-medium">Members:</p>
                      {(team as any)?.members?.length > 0 ? (
                        ((team as any).members as TeamMember[]).map((member: TeamMember) => {
                          const user = users.find(u => u.id === member.userId);
                          return (
                            <div key={member.id} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              {user?.name || "Unknown User"}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-gray-400">No members yet</p>
                      )}
                    </div>

                    {/* Add Member Form */}
                    {(team as any)?.members?.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <select
                          value={selectedTeamForMembers || ""}
                          onChange={(e) => setSelectedTeamForMembers(e.target.value)}
                          className="text-sm border rounded px-2 py-1 mb-2 w-full"
                        >
                          <option value="">Select team...</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>

                        <select
                          value={selectedUser?.id || ""}
                          onChange={(e) => setSelectedUser(users.find(u => u.id === e.target.value) || null)}
                          className="text-sm border rounded px-2 py-1 mb-2 w-full"
                        >
                          <option value="">Select user...</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>

                        <button
                          onClick={handleAssignUserToTeam}
                          disabled={!selectedUser || !selectedTeamForMembers}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          Assign User
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Create Team Modal */}
            {showTeamForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                  <h3 className="text-xl font-semibold mb-4">Create New Team</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Team Name</label>
                      <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="Enter team name"
                        className="border p-2 rounded w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Logo URL (optional)</label>
                      <input
                        type="text"
                        value={newTeamLogoUrl}
                        onChange={(e) => setNewTeamLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="border p-2 rounded w-full"
                      />
                    </div>

                    <div className="flex gap-2 pt-4">
                      <button
                        onClick={handleCreateTeam}
                        disabled={!newTeamName.trim()}
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        Create Team
                      </button>
                      <button
                        onClick={() => setShowTeamForm(false)}
                        className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Family Members */}
        <section className="bg-white/90 dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">Family Members</h2>

          {users.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No members yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {users.map((user) => (
                <div key={user.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold">{user.name}</h3>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Role:</span>
                      <span className="capitalize">{user.role}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Points:</span>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">{user.pointsTotal}</span>
                    </div>
                  </div>

                    {family.teamsEnabled && teams?.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm font-medium mb-2">Teams:</p>
                        <div className="flex flex-wrap gap-1">
                          {(teams as any[]).filter((t: Team) => {
                            const teamWithMembers = (teams as any[]).find((tm: Team) => 
                              tm.members?.some((m: TeamMember) => m.userId === user.id)
                            );
                            return teamWithMembers && teamWithMembers.name === t.name;
                          }).map((team: Team) => (
                            <span key={team.id} className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                              {team.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
