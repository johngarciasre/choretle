"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import RotationBoard from "@/components/RotationBoard";
import type { UserRotation, SlateWithRotations, RotationAssignment } from "@/components/AssignmentCard";

interface Family {
  id: string;
  name: string;
}

export default function RotationsPage() {
  const [family, setFamily] = useState<Family | null>(null);
  const [users, setUsers] = useState<UserRotation[]>([]);
  const [slates, setSlates] = useState<SlateWithRotations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRotationData();
  }, []);

  async function loadRotationData() {
    try {
      // Try to fetch from API first
      const response = await fetch("/api/rotations");
      if (response.ok) {
        const data = await response.json();
        setFamily(data.family || null);
        setUsers(data.users || []);
        setSlates(data.slates || []);
        setLoading(false);
        return;
      }
    } catch {
      // Fall through to mock data
    }

    // Mock data for development / no API
    const mockFamily: Family = { id: "mock-family", name: "Demo Family" };
    const mockUsers: UserRotation[] = [
      {
        id: "u1",
        userId: "u1",
        slateId: "",
        order: 0,
        intervalDays: 7,
        isActive: true,
        userName: "Alice",
        userAvatarUrl: "",
        userPointsTotal: 120,
        userRole: "child",
      },
      {
        id: "u2",
        userId: "u2",
        slateId: "",
        order: 0,
        intervalDays: 7,
        isActive: true,
        userName: "Bob",
        userAvatarUrl: "",
        userPointsTotal: 95,
        userRole: "child",
      },
      {
        id: "u3",
        userId: "u3",
        slateId: "",
        order: 0,
        intervalDays: 7,
        isActive: true,
        userName: "Charlie",
        userAvatarUrl: "",
        userPointsTotal: 75,
        userRole: "child",
      },
    ];

    const mockSlates: SlateWithRotations[] = [
      {
        id: "s1",
        name: "Kitchen Cleaning",
        description: "Deep clean the kitchen including countertops and stove",
        roomLocation: "Kitchen",
        frequency: "weekly",
        interval: 7,
        assignments: [
          {
            id: "r1",
            userId: "u1",
            slateId: "s1",
            order: 1,
            intervalDays: 7,
            isActive: true,
            userName: "Alice",
            userAvatarUrl: "",
            userPointsTotal: 120,
            userRole: "child",
          },
          {
            id: "r2",
            userId: "u3",
            slateId: "s1",
            order: 2,
            intervalDays: 7,
            isActive: true,
            userName: "Charlie",
            userAvatarUrl: "",
            userPointsTotal: 75,
            userRole: "child",
          },
        ],
      },
      {
        id: "s2",
        name: "Bathroom Sanitation",
        description: "Clean toilet, sink, shower/tub, and mirror",
        roomLocation: "Bathroom",
        frequency: "biweekly",
        interval: 14,
        assignments: [
          {
            id: "r3",
            userId: "u2",
            slateId: "s2",
            order: 1,
            intervalDays: 7,
            isActive: true,
            userName: "Bob",
            userAvatarUrl: "",
            userPointsTotal: 95,
            userRole: "child",
          },
        ],
      },
    ];

    setFamily(mockFamily);
    setUsers(mockUsers);
    setSlates(mockSlates);
    setLoading(false);
  }

  const handleSave = async (assignments: RotationAssignment[]) => {
    try {
      // Save each assignment via the API route (server-side only)
      for (const assignment of assignments) {
        await fetch("/api/rotations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(assignment),
        });
      }
    } catch (err) {
      console.error("Failed to save rotation:", err);
      throw err;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-sunny/20">
      {/* Navigation */}
      <nav className="bg-white/10 backdrop-blur-lg p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-grape">Choretle</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/tasks" className="hover:underline">Tasks</Link>
          <Link href="/rotations" className="hover:underline text-grape font-semibold">Rotations</Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-8 space-y-8">
        <header>
          <h2 className="text-2xl font-bold text-ink">Rotation Assignment</h2>
          {family && (
            <p className="text-sm text-ink/60 mt-1">
              Family: <span className="font-medium">{family.name}</span> &middot; {users.length} users &middot; {slates.length} slates
            </p>
          )}
        </header>

        <RotationBoard
          familyName={family?.name || ""}
          users={users}
          slates={slates}
          onSave={handleSave}
        />
      </main>
    </div>
  );
}
