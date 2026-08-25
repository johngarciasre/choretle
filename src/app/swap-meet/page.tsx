"use client";

import { getSupabaseBrowser } from "@/supabase/client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageShell, PageLoader } from "@/components/ui";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

interface RotationAssignment {
  date: string;
  userId: string;
  userName?: string;
  isCurrent?: boolean;
  rotationId?: string;
}

interface SlateSchedule {
  slateId: string;
  slateName: string;
  frequency: string;
  interval: number;
  assignments: RotationAssignment[];
}

interface RotationEntry {
  id: string;
  userId: string;
  userName?: string;
  order: number;
  isActive: boolean;
  slateId: string;
}

interface SwapMeetEntry {
  id: string;
  slateId: string;
  sharingFamilyId: string;
  requestedBy: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export default function SwapMeetPage() {
  const authChecked = useAuthRedirect();
  const pathname = usePathname();
  const [schedule, setSchedule] = useState<SlateSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState("");
  const [daysAhead, setDaysAhead] = useState(30);

  // Swap UI state
  const [selectedSlateId, setSelectedSlateId] = useState("");
  const [rotation1Id, setRotation1Id] = useState("");
  const [rotation2Id, setRotation2Id] = useState("");
  const [rotations, setRotations] = useState<RotationEntry[]>([]);
  const [swaps, setSwaps] = useState<SwapMeetEntry[]>([]);

  // Share slate state
  const [showShareModal, setShowShareModal] = useState(false);
  const [requestingFamilyId, setRequestingFamilyId] = useState("");
  const [selectedSlateIdsForSharing, setSelectedSlateIdsForSharing] = useState<string[]>([]);

  useEffect(() => {
    typeof window !== "undefined" && (document.title = "Choretle - Swap Meet");
    const storedFamilyId = typeof window !== "undefined" && localStorage.getItem("familyId");
    if (storedFamilyId) {
      setFamilyId(storedFamilyId);
      fetchSchedule(storedFamilyId, daysAhead);
      fetchSwaps(storedFamilyId);
    } else {
      setLoading(false);
    }
  }, [daysAhead]);

  const fetchSchedule = async (fid: string, days: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/swap-meet?familyId=${fid}&daysAhead=${days}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch schedule");
      }
      
      setSchedule(data.assignments || []);

      // Fetch rotations for swap UI from first slate
      if (data.assignments?.length > 0) {
        const slateId = data.assignments[0].slateId;
        await fetchRotations(fid, slateId);
      }
    } catch (error) {
      error({ err: error }, "Failed to fetch rotation schedule");
    } finally {
      setLoading(false);
    }
  };

  const fetchRotations = async (fid: string, slateId: string) => {
    try {
      const response = await fetch(`/api/rotations?familyId=${fid}&slateId=${slateId}`);
      if (!response.ok) return;
      const data = await response.json();
      setRotations(data.rotations || []);
    } catch (error) {
      error({ err: error }, "Failed to fetch rotations");
    }
  };

  const fetchSwaps = async (fid: string) => {
    try {
      const response = await fetch(`/api/family/swap-meet?familyId=${fid}`);
      if (!response.ok) return;
      const data = await response.json();
      setSwaps(data.swaps || []);
    } catch (error) {
      error({ err: error }, "Failed to fetch swaps");
    }
  };

  const handleSlateSelect = async (slateId: string) => {
    setSelectedSlateId(slateId);
    
    // Fetch rotations for this slate if not already loaded
    if (rotations.length === 0 && familyId) {
      await fetchRotations(familyId, slateId);
    }
  };

  const handleSwap = async () => {
    if (!familyId || !selectedSlateId || !rotation1Id || !rotation2Id) {
      alert("Please select a family ID, slate, and two rotation entries to swap.");
      return;
    }

    try {
      // Get the user who is making the request from cookies
      const cookie = document.cookie.split("; ").find(row => row.startsWith("auth-token="));
      const token = cookie ? cookie.split("=")[1] : null;

      const response = await fetch("/api/swap-meet", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Cookie": `auth-token=${token}` } : {})
        },
        body: JSON.stringify({
          familyId,
          slateId: selectedSlateId,
          rotationId1: rotation1Id,
          rotationId2: rotation2Id,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        alert("Rotations swapped successfully!");
        fetchSchedule(familyId, daysAhead);
        setRotation1Id("");
        setRotation2Id("");
      } else {
        alert(data.error || "Failed to swap rotations.");
      }
    } catch (error) {
      error({ err: error }, "Swap failed");
      alert("An error occurred while swapping rotations.");
    }
  };

  const handleShareSlate = async () => {
    if (!familyId || !requestingFamilyId || selectedSlateIdsForSharing.length === 0) {
      alert("Please enter a family ID and select at least one slate to share.");
      return;
    }

    try {
      const cookie = document.cookie.split("; ").find(row => row.startsWith("auth-token="));
      const token = cookie ? cookie.split("=")[1] : null;

      const response = await fetch("/api/swap-meet", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Cookie": `auth-token=${token}` } : {})
        },
        body: JSON.stringify({
          sharingFamilyId: familyId,
          requestingFamilyId,
          slateIds: selectedSlateIdsForSharing,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        alert("Slate(s) shared successfully!");
        setShowShareModal(false);
        setRequestingFamilyId("");
        setSelectedSlateIdsForSharing([]);
        
        // Refresh swaps list
        if (familyId) {
          await fetchSwaps(familyId);
        }
      } else {
        alert(data.error || "Failed to share slate.");
      }
    } catch (error) {
      error({ err: error }, "Share failed");
      alert("An error occurred while sharing slates.");
    }
  };

  const openShareModal = async () => {
    if (!familyId) return;
    
    // Fetch family ID from another family
    try {
      setShowShareModal(true);
      setRequestingFamilyId("");
      setSelectedSlateIdsForSharing([]);
      
      await fetchSwaps(familyId);
    } catch (error) {
      error({ err: error }, "Failed to open share modal");
    }
  };

  const closeShareModal = () => {
    setShowShareModal(false);
    setRequestingFamilyId("");
    setSelectedSlateIdsForSharing([]);
  };

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;

  if (!familyId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream to-bubblegum/20">
        <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-sm text-ink/60">Back to Dashboard</span>
          </Link>
          <h1 className="text-2xl font-bold text-grape">Choretle</h1>
          <div className="flex gap-4">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <Link href="/swap-meet" className="hover:underline text-indigo-600 font-semibold">Swap Meet</Link>
          </div>
        </nav>

        <main className="max-w-xl mx-auto p-8 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Set Your Family ID</h2>
          <p className="text-ink/60 mb-4">Enter your family ID to view your rotation schedule.</p>
          <input
            type="text"
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
            placeholder="Enter family ID"
            className="border p-2 rounded w-full mb-4"
          />
          <button
            onClick={() => familyId && fetchSchedule(familyId, daysAhead)}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Load Schedule
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-bubblegum/20">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-sm text-ink/60">Back to Dashboard</span>
        </Link>
        <h1 className="text-2xl font-bold text-grape">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/swap-meet" className="hover:underline text-indigo-600 font-semibold">Swap Meet</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Schedule Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Rotation Schedule</h2>
            <div className="flex gap-2">
              {[7, 14, 30, 60].map((days) => (
                <button
                  key={days}
                  onClick={() => fetchSchedule(familyId, days)}
                  className={`px-3 py-1 rounded text-sm ${
                    days === daysAhead 
                      ? "bg-indigo-600 text-white" 
                      : "bg-ink/10 hover:bg-ink/20"
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
          
          <p className="text-ink/60 mb-4">View your upcoming chore assignments.</p>

          {loading ? (
            <p className="text-ink/60">Loading schedule...</p>
          ) : schedule.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-ink/60">No rotation schedule found. Set up rotations in your family settings.</p>
            </div>
          ) : (
            schedule.map((slate) => (
              <div key={slate.slateId} className="mb-6 bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{slate.slateName || `Slate: ${slate.slateId}`}</h3>
                    <p className="text-sm text-ink/60">
                      {slate.frequency} · Every {slate.interval} days
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-7 lg:grid-cols-10 gap-1">
                  {slate.assignments.map((assignment, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded text-center text-xs transition-all ${
                        assignment.isCurrent
                          ? "bg-grape/20 border-2 border-grape shadow-md"
                          : "bg-ink/5 hover:bg-ink/10"
                      }`}
                    >
                      <div className="font-semibold text-sm">{assignment.date}</div>
                      <div className={assignment.userName ? "text-xs mt-1" : ""}>
                        {assignment.userName || assignment.userId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Swap Assignments Section */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-4">Swap Assignments</h2>
          <p className="text-ink/60 mb-4">Select two rotation entries to swap between users.</p>

          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Family ID</label>
                <input
                  type="text"
                  value={familyId}
                  onChange={(e) => setFamilyId(e.target.value)}
                  className="border p-2 rounded w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Slate</label>
                <select
                  value={selectedSlateId}
                  onChange={(e) => handleSlateSelect(e.target.value)}
                  className="border p-2 rounded w-full"
                >
                  <option value="">Select a slate...</option>
                  {schedule.map((slate) => (
                    <option key={slate.slateId} value={slate.slateId}>
                      {slate.slateName || `Slate: ${slate.slateId}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Rotation 1</label>
                <select
                  value={rotation1Id}
                  onChange={(e) => setRotation1Id(e.target.value)}
                  className="border p-2 rounded w-full"
                >
                  <option value="">Select rotation 1...</option>
                  {rotations.map((rot) => (
                    <option key={rot.id} value={rot.id}>
                      {rot.userName || rot.userId} (Order: {rot.order})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Rotation 2</label>
                <select
                  value={rotation2Id}
                  onChange={(e) => setRotation2Id(e.target.value)}
                  className="border p-2 rounded w-full"
                >
                  <option value="">Select rotation 2...</option>
                  {rotations.map((rot) => (
                    <option key={rot.id} value={rot.id}>
                      {rot.userName || rot.userId} (Order: {rot.order})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleSwap}
              disabled={!selectedSlateId || !rotation1Id || !rotation2Id || !familyId}
              className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Swap Rotations
            </button>
          </div>
        </section>

        {/* Share Slate Section */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-4">Share Slates</h2>
          <p className="text-ink/60 mb-4">Share your slates with another family for swap meet.</p>

          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <button
              onClick={openShareModal}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Share Slate(s)
            </button>

            {swaps.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Pending Requests</h3>
                <div className="space-y-2">
                  {swaps.map((swap) => (
                    <div key={swap.id} className="bg-ink/5 p-3 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">Slate: {swap.slateId}</p>
                          <p className="text-xs text-ink/60">
                            Requested by family ID: {swap.requestedBy}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${
                          swap.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                          swap.status === "accepted" ? "bg-green-100 text-green-800" :
                          "bg-red-100 text-red-800"
                        }`}>
                          {swap.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Share Slate Modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-semibold mb-4">Share Slates</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Enter other family's ID</label>
                  <input
                    type="text"
                    value={requestingFamilyId}
                    onChange={(e) => setRequestingFamilyId(e.target.value)}
                    placeholder="Enter family ID"
                    className="border p-2 rounded w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Select slates to share</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {schedule.map((slate) => (
                      <label key={slate.slateId} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedSlateIdsForSharing.includes(slate.slateId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSlateIdsForSharing([...selectedSlateIdsForSharing, slate.slateId]);
                            } else {
                              setSelectedSlateIdsForSharing(selectedSlateIdsForSharing.filter(id => id !== slate.slateId));
                            }
                          }}
                          className="rounded"
                        />
                        <span>{slate.slateName || `Slate: ${slate.slateId}`}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleShareSlate}
                    disabled={!requestingFamilyId || selectedSlateIdsForSharing.length === 0}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Share
                  </button>
                  <button
                    onClick={closeShareModal}
                    className="flex-1 bg-ink/10 text-ink px-4 py-2 rounded hover:bg-ink/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
