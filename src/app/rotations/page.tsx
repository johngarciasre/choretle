"use client";

import { useState, useEffect } from "react";
import { PageShell, PageHeader, PageLoader } from "@/components/ui";
import RotationBoard from "@/components/RotationBoard";
import type { UserRotation, SlateWithRotations, RotationAssignment } from "@/components/AssignmentCard";
import { error } from "@/lib/logger";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

interface Household {
  id: string;
  name: string;
}

export default function RotationsPage() {
  const authChecked = useAuthRedirect();
  const [household, setHousehold] = useState<Household | null>(null);
  const [users, setUsers] = useState<UserRotation[]>([]);
  const [slates, setSlates] = useState<SlateWithRotations[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadRotationData(allowMock = false) {
    try {
      // Get household ID from auth endpoint
      const authRes = await fetch("/api/auth/me", { credentials: "include" });
      if (!authRes.ok) throw new Error("Not authenticated");
      const authData = await authRes.json();
      const householdId = authData.householdId;

      if (!householdId) {
        throw new Error("No household ID");
      }

      const response = await fetch(`/api/rotations?householdId=${householdId}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setHousehold(data.household || null);
        setUsers(data.users || []);
        setSlates(data.slates || []);
        setLoading(false);
        return;
      }
    } catch {
      // Fall through to mock data
    }

    if (!allowMock) {
      setLoading(false);
      return;
    }

    const mockHousehold: Household = { id: "mock-household", name: "Demo Household" };
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

    setHousehold(mockHousehold);
    setUsers(mockUsers);
    setSlates(mockSlates);
    setLoading(false);
  }

  useEffect(() => {
    if (!authChecked) return;
    if (typeof window !== "undefined") document.title = "Choretle - Rotations";
    loadRotationData(true);
  }, [authChecked]);

  const handleSave = async (assignments: RotationAssignment[], removedIds: string[]) => {
    try {
      // Get household ID from auth endpoint
      const authRes = await fetch("/api/auth/me", { credentials: "include" });
      if (!authRes.ok) throw new Error("Not authenticated");
      const authData = await authRes.json();
      const householdId = authData.householdId;

      for (const assignment of assignments) {
        const res = await fetch(`/api/rotations?householdId=${householdId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(assignment),
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Saving rotation failed: ${res.status} ${await res.text()}`);
      }

      for (const id of removedIds) {
        const res = await fetch(`/api/rotations/${id}?householdId=${householdId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(`Removing rotation failed: ${res.status} ${await res.text()}`);
        }
      }

      // Re-read the server's state so saved rows get their real ids.
      await loadRotationData();
    } catch (err) {
      error({ err: err }, "Failed to save rotation");
      throw err;
    }
  };

  if (!authChecked) return <PageShell><PageLoader label="Checking authentication..." /></PageShell>;
  if (loading) return <PageShell><PageLoader label="Loading rotations..." /></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Rotations"
        subtitle={`Household: ${household?.name || "No household"} · ${users.length + slates.reduce((acc, s) => acc + s.assignments.length, 0)} assignments`}
        actions={
          <span className="text-sm text-ink/60">{slates.length} slates configured</span>
        }
      />

      <main className="space-y-8">
        <RotationBoard
          householdName={household?.name || ""}
          users={users}
          slates={slates}
          onSave={handleSave}
          onSlatesChange={setSlates}
        />
      </main>
    </PageShell>
  );
}
