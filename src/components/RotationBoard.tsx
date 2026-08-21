"use client";

import { useState, useCallback } from "react";
import { Save, Clock, Users, PanelsLeftRight } from "lucide-react";
import type { UserRotation, SlateWithRotations, RotationAssignment } from "./AssignmentCard";
import AssignmentCard from "./AssignmentCard";

interface RotationBoardProps {
  familyName: string;
  users: UserRotation[];
  slates: SlateWithRotations[];
  onSave: (assignments: RotationAssignment[]) => Promise<void>;
}

export default function RotationBoard({ familyName, users, slates, onSave }: RotationBoardProps) {
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
  const [dragOverSlate, setDragOverSlate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  const handleDragStart = useCallback((e: React.DragEvent, userId: string) => {
    e.dataTransfer.setData("userId", userId);
    setDraggedUserId(userId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverSlate(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, slateId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSlate(slateId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, slateId: string) => {
    e.preventDefault();
    const userId = e.dataTransfer.getData("userId");
    if (!userId) return;

    setDraggedUserId(null);
    setDragOverSlate(null);

    // Find the target slate
    const slate = slates.find((s) => s.id === slateId);
    if (!slate) return;

    // Check if user already has an assignment on this slate
    const existingIndex = slate.assignments.findIndex((a) => a.userId === userId);
    if (existingIndex >= 0) {
      // Move the existing assignment to the end of this slate's list
      const [moved] = slate.assignments.splice(existingIndex, 1);
      moved.order = slate.assignments.length;
      moved.intervalDays = moved.intervalDays || 7;
      slate.assignments.push(moved);

      // Re-index all assignments in this slate
      slate.assignments.forEach((a, i) => { a.order = i + 1; });
      return;
    }

    // Create new assignment at end of slate
    const newUserRotation: UserRotation = {
      id: undefined,
      userId,
      slateId,
      order: slate.assignments.length + 1,
      intervalDays: 7,
      isActive: true,
      userName: "",
      userPointsTotal: 0,
      userRole: "child",
    };

    // Find the user data from users list
    const userData = users.find((u) => u.userId === userId);
    if (userData) {
      newUserRotation.userName = userData.userName;
      newUserRotation.userAvatarUrl = userData.userAvatarUrl;
      newUserRotation.userPointsTotal = userData.userPointsTotal;
      newUserRotation.userRole = userData.userRole;
    }

    slate.assignments.push(newUserRotation);
  }, [slates, users]);

  const handleEditInterval = useCallback((assignmentId: string | undefined, intervalDays: number) => {
    for (const slate of slates) {
      const assignment = slate.assignments.find((a) => a.id === assignmentId);
      if (assignment) {
        assignment.intervalDays = intervalDays;
        break;
      }
    }
  }, [slates]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");

    const allAssignments: RotationAssignment[] = [];

    for (const slate of slates) {
      for (const assignment of slate.assignments) {
        if (assignment.id) {
          allAssignments.push({ id: assignment.id, ...assignment });
        } else {
          allAssignments.push({ ...assignment });
        }
      }
    }

    try {
      await onSave(allAssignments);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {saveStatus === "success" && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm font-medium text-center">
          Rotation saved successfully!
        </div>
      )}
      {saveStatus === "error" && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300 text-sm font-medium text-center">
          Failed to save rotation. Please try again.
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Users Column */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Users size={14} />
            Users
          </h3>

          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.userId}
                draggable
                onDragStart={(e) => handleDragStart(e, user.userId)}
                onDragEnd={() => setDraggedUserId(null)}
                className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 border border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600"
              >
                <span className="text-gray-400 dark:text-gray-500" aria-hidden="true">
                  <Users size={16} />
                </span>

                <img src={user.userAvatarUrl || `https://ui.boringavatars.com/badge/1/${user.userId.length}/flat`} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" draggable={false} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.userName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user.userRole} &middot; {user.userPointsTotal} pts</p>
                </div>

                {user.id && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                    Active
                  </span>
                )}
              </div>
            ))}

            {users.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic p-3 text-center">No users to display</p>
            )}
          </div>
        </div>

        {/* Slates Column */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <PanelsLeftRight size={14} />
            Slates
          </h3>

          <div className="space-y-4">
            {slates.map((slate) => (
              <div
                key={slate.id}
                onDragOver={(e) => handleDragOver(e, slate.id)}
                onDrop={(e) => handleDrop(e, slate.id)}
                onDragLeave={handleDragLeave}
                className={`rounded-xl border-2 border-dashed p-4 transition-shadow ${
                  dragOverSlate === slate.id
                    ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950"
                    : "border-gray-300 dark:border-gray-600 hover:border-indigo-300"
                }`}
              >
                {/* Slate Header */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold text-lg">{slate.name}</h4>
                    {slate.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{slate.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {slate.roomLocation && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {slate.roomLocation}
                      </span>
                    )}
                  </div>
                </div>

                {/* Slate Meta */}
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 capitalize font-medium">
                    {slate.frequency}
                  </span>
                  <span className="text-xs flex items-center gap-1 text-gray-500 dark:text-gray-400">
                    <Clock size={12} />
                    Every {slate.interval} day{slate.interval > 1 ? "s" : ""}
                  </span>

                  {/* Drop zone hint */}
                  {slate.assignments.length === 0 && !dragOverSlate && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic ml-auto">
                      Drag users here to assign
                    </p>
                  )}
                </div>

                {/* Assignments */}
                <div className="space-y-2">
                  {slate.assignments.map((assignment) => (
                    <AssignmentCard
                      key={assignment.id ?? `${assignment.userId}-${slate.id}`}
                      assignment={assignment}
                      onDragStart={handleDragStart}
                      onEditInterval={(intervalDays: number) => {
                        handleEditInterval(assignment.id, intervalDays);
                      }}
                    />
                  ))}

                  {/* Empty drop zone indicator */}
                  {slate.assignments.length === 0 && (
                    <div className="flex items-center justify-center py-4 text-gray-400 dark:text-gray-500 text-sm">
                      Drop users here
                    </div>
                  )}
                </div>
              </div>
            ))}

            {slates.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic p-3 text-center">No slates to display</p>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving || slates.every((s) => s.assignments.length === 0)}
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-shadow ${
            saving
              ? "bg-indigo-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800"
          } text-white`}
        >
          {saving ? (
            <>
              <svg className="animate-spin" viewBox="1 24" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 12a9 9 0A6 12"/>
              </svg>
              Saving...
            </>
          ) : (
            <>
              <Save size={18} />
              Save Rotation
            </>
          )}
        </button>
      </div>
    </div>
  );
}
