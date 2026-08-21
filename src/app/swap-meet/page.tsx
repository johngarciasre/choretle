"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface RotationAssignment {
  date: string;
  userId: string;
  isCurrent?: boolean;
}

interface SlateSchedule {
  slateId: string;
  assignments: RotationAssignment[];
}

interface RotationEntry {
  id: string;
  userId: string;
  order: number;
  isActive: boolean;
}

export default function SwapMeetPage() {
  const [schedule, setSchedule] = useState<SlateSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState("");
  const [daysAhead, setDaysAhead] = useState(30);

  // Swap UI state
  const [selectedSlateId, setSelectedSlateId] = useState("");
  const [rotation1Id, setRotation1Id] = useState("");
  const [rotation2Id, setRotation2Id] = useState("");
  const [rotations, setRotations] = useState<RotationEntry[]>([]);

  useEffect(() => {
    const storedFamilyId = typeof window !== "undefined" && localStorage.getItem("familyId");
    if (storedFamilyId) {
      setFamilyId(storedFamilyId);
      fetchSchedule(storedFamilyId, daysAhead);
    } else {
      setLoading(false);
    }
  }, [daysAhead]);

  const fetchSchedule = async (fid: string, days: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/swap-meet?familyId=${fid}&daysAhead=${days}`);
      const data = await response.json();
      setSchedule(data.assignments || []);

      // Fetch rotations for the swap UI
      if (data.assignments?.length > 0) {
        const slateId = data.assignments[0].slateId;
        const rotResponse = await fetch(`/api/swap-meet?familyId=${fid}&slateId=${slateId}`);
        // Use the GET endpoint to get rotations
      }
    } catch (error) {
      console.error("Failed to fetch rotation schedule:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSlateSelect = async (slateId: string) => {
    setSelectedSlateId(slateId);
    try {
      const response = await fetch(`/api/swap-meet?familyId=${familyId}&slateId=${slateId}`);
      if (!response.ok) return;
      const data = await response.json();
      // Fetch rotations for this slate
      const rotResponse = await fetch(`/api/family?${new URLSearchParams({ id: familyId })}`);
      if (rotations.length === 0) {
        // Placeholder until we have rotation data
      }
    } catch (error) {
      console.error("Failed to fetch rotations:", error);
    }
  };

  const handleSwap = async () => {
    if (!selectedSlateId || !rotation1Id || !rotation2Id) {
      alert("Please select a slate and two rotation entries to swap.");
      return;
    }

    try {
      const response = await fetch("/api/swap-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        // Reset form
        setRotation1Id("");
        setRotation2Id("");
      } else {
        alert(data.error || "Failed to swap rotations.");
      }
    } catch (error) {
      console.error("Swap failed:", error);
      alert("An error occurred while swapping rotations.");
    }
  };

  if (!familyId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
          <div className="flex gap-4">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <Link href="/swap-meet" className="hover:underline text-indigo-600 font-semibold">Swap Meet</Link>
          </div>
        </nav>

        <main className="max-w-xl mx-auto p-8 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Set Your Family ID</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Enter your family ID to view your rotation schedule.</p>
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/swap-meet" className="hover:underline text-indigo-600 font-semibold">Swap Meet</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 space-y-4">
        <section>
          <h2 className="text-xl font-semibold mb-4">Rotation Schedule</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">View your upcoming chore assignments and swap with others.</p>

          {/* Days selector */}
          <div className="mb-4 flex gap-2">
            {[7, 14, 30, 60].map((days) => (
              <button
                key={days}
                onClick={() => fetchSchedule(familyId, days)}
                className={`px-3 py-1 rounded ${days === daysAhead ? "bg-indigo-600 text-white" : "bg-gray-200 dark:bg-gray-700"}`}
              >
                {days} days
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading schedule...</p>
          ) : schedule.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No rotation schedule found. Set up rotations in your family settings.</p>
          ) : (
            schedule.map((slate) => (
              <div key={slate.slateId} className="mb-6 bg-white/90 dark:bg-gray-800 p-4 rounded-lg shadow">
                <h3 className="font-semibold mb-2">Slate: {slate.slateId}</h3>
                <div className="grid grid-cols-1 md:grid-cols-7 lg:grid-cols-10 gap-1">
                  {slate.assignments.map((assignment, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded text-center text-xs ${
                        assignment.isCurrent
                          ? "bg-indigo-100 dark:bg-indigo-900 border-2 border-indigo-500"
                          : "bg-gray-100 dark:bg-gray-700"
                      }`}
                    >
                      <div className="font-semibold">{assignment.date}</div>
                      <div>{assignment.userId}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Swap section */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Swap Assignments</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Select two rotation entries to swap between users.</p>

          <div className="bg-white/90 dark:bg-gray-800 p-4 rounded-lg shadow space-y-2">
            <div>
              <label className="block text-sm font-medium mb-1">Family ID</label>
              <input
                type="text"
                value={familyId}
                onChange={(e) => setFamilyId(e.target.value)}
                className="border p-2 rounded w-full max-w-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slate</label>
              <select
                value={selectedSlateId}
                onChange={(e) => handleSlateSelect(e.target.value)}
                className="border p-2 rounded w-full max-w-md"
              >
                <option value="">Select a slate...</option>
                {schedule.map((slate) => (
                  <option key={slate.slateId} value={slate.slateId}>
                    Slate: {slate.slateId}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Rotation 1</label>
                <input
                  type="text"
                  value={rotation1Id}
                  onChange={(e) => setRotation1Id(e.target.value)}
                  placeholder="Enter rotation ID 1"
                  className="border p-2 rounded w-full max-w-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rotation 2</label>
                <input
                  type="text"
                  value={rotation2Id}
                  onChange={(e) => setRotation2Id(e.target.value)}
                  placeholder="Enter rotation ID 2"
                  className="border p-2 rounded w-full max-w-md"
                />
              </div>
            </div>

            <button
              onClick={handleSwap}
              disabled={!selectedSlateId || !rotation1Id || !rotation2Id}
              className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 mt-2 disabled:opacity-50"
            >
              Swap
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
