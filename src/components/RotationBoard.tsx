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

const accentColors = ["coral", "teal", "sunny", "grape", "bubblegum", "coral", "teal"] as const;

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
        <div className="p-3 rounded-xl bg-teal/20 text-teal font-medium text-center border-2 border-teal">
          Rotation saved successfully!
        </div>
      )}
      {saveStatus === "error" && (
        <div className="p-3 rounded-xl bg-grape/20 text-grape font-medium text-center border-2 border-grape">
          Failed to save rotation. Please try again.
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Users Column */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-ink/60 uppercase tracking-wider mb-2 flex items-center gap-2">
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
                className="flex items-center gap-3 bg-white rounded-xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] p-3 border-2 border-ink/10 cursor-grab active:cursor-grabbing hover:shadow-lg hover:border-grape/40 transition-all"
              >
                <span className="text-ink/30" aria-hidden="true">
                  <Users size={16} />
                </span>

                <img src={user.userAvatarUrl || `https://ui.boringavatars.com/badge/1/${user.userId.length}/flat`} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" draggable={false} />

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink truncate">{user.userName}</p>
                  <p className="text-xs text-ink/60 capitalize">{user.userRole} &middot; {user.userPointsTotal} pts</p>
                </div>

                {user.id && (
                  <span className="font-bold px-2 py-0.5 rounded-full bg-grape/15 text-grape text-xs">
                    Active
                  </span>
                )}
              </div>
            ))}

            {users.length === 0 && (
              <p className="text-sm text-ink/60 italic p-3 text-center">No users to display</p>
            )}
          </div>
        </div>

        {/* Slates Column */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-ink/60 uppercase tracking-wider mb-2 flex items-center gap-2">
            <PanelsLeftRight size={14} />
            Slates
          </h3>

          <div className="space-y-4">
            {slates.map((slate, slateIndex) => {
              const accent = accentColors[slateIndex % accentColors.length];
              return (
                <div
                  key={slate.id}
                  onDragOver={(e) => handleDragOver(e, slate.id)}
                  onDrop={(e) => handleDrop(e, slate.id)}
                  onDragLeave={handleDragLeave}
                  className={`bg-white rounded-2xl p-3 border-2 transition-all ${
                    dragOverSlate === slate.id
                      ? `border-${accent}-400 bg-${accent}/5`
                      : "border-ink/10 hover:border-grape/40"
                  }`}
                >
                  {/* Slate Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-lg text-ink">{slate.name}</h4>
                      {slate.description && (
                        <p className="text-sm text-ink/60 mt-1">{slate.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {slate.roomLocation && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-ink/5 text-ink font-bold border border-ink/10">
                          {slate.roomLocation}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Slate Meta */}
                  <div className="flex items-center gap-4 mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full bg-${accent}-100 text-${accent} capitalize font-bold border border-${accent}/20`}>
                      {slate.frequency}
                    </span>
                    <span className="text-xs flex items-center gap-1 text-ink/60">
                      <Clock size={12} />
                      Every {slate.interval} day{slate.interval > 1 ? "s" : ""}
                    </span>

                    {/* Drop zone hint */}
                    {slate.assignments.length === 0 && !dragOverSlate && (
                      <p className="text-xs text-ink/40 italic ml-auto">
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
                      <div className={`flex items-center justify-center py-4 text-${accent}/50 text-sm border-2 border-dashed border-${accent}/40 rounded-xl`}>
                        Drop users here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {slates.length === 0 && (
              <p className="text-sm text-ink/60 italic p-3 text-center">No slates to display</p>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving || slates.every((s) => s.assignments.length === 0)}
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all ${
            saving
              ? "bg-grape/50 cursor-not-allowed"
              : "bg-grape hover:bg-grape/90 active:bg-grape/95 shadow-md shadow-grape/30"
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
