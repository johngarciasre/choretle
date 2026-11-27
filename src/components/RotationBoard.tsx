"use client";

import { useState, useCallback } from "react";
import { Save, Clock, Users, PanelsLeftRight } from "lucide-react";
import type { UserRotation, SlateWithRotations, RotationAssignment } from "./AssignmentCard";
import AssignmentCard from "./AssignmentCard";
import { getAvatarEmoji } from "@/lib/avatar";

interface RotationBoardProps {
  householdName: string;
  users: UserRotation[];
  slates: SlateWithRotations[];
  onSave: (assignments: RotationAssignment[], removedIds: string[]) => Promise<void>;
  onSlatesChange: (slates: SlateWithRotations[]) => void;
}

// Static class strings — Tailwind cannot generate interpolated class names.
const accentStyles = [
  { over: "border-coral bg-coral/5", badge: "bg-coral/15 text-ink border-coral/30", zone: "text-coral/70 border-coral/40" },
  { over: "border-teal bg-teal/5", badge: "bg-teal/15 text-ink border-teal/30", zone: "text-teal/70 border-teal/40" },
  { over: "border-sunny bg-sunny/10", badge: "bg-sunny/25 text-ink border-sunny/50", zone: "text-ink/50 border-sunny/60" },
  { over: "border-grape bg-grape/5", badge: "bg-grape/15 text-ink border-grape/30", zone: "text-grape/70 border-grape/40" },
  { over: "border-bubblegum bg-bubblegum/5", badge: "bg-bubblegum/15 text-ink border-bubblegum/30", zone: "text-bubblegum/70 border-bubblegum/40" },
] as const;

export default function RotationBoard({ users, slates, onSave, onSlatesChange }: RotationBoardProps) {
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
  const [dragOverSlate, setDragOverSlate] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Group users by role for sidebar display
  const parentUsers = users.filter((u) => u.userRole === "parent");
  const childUsers = users.filter((u) => u.userRole === "child");
  const adminUsers = users.filter((u) => u.userRole === "admin");

  const handleDragStart = useCallback((e: React.DragEvent, userId: string) => {
    e.dataTransfer.setData("userId", userId);
    setDraggedUserId(userId);
  }, []);

  const assignedUserIds = new Set(
    slates.flatMap((s) => s.assignments.filter((a) => a.isActive !== false).map((a) => a.userId)),
  );

  const renderUser = (user: UserRotation) => (
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

      {user.userAvatarUrl ? (
        <img src={user.userAvatarUrl} alt="" className="w-8 h-8 rounded-full object-cover object-top flex-shrink-0" draggable={false} />
      ) : user.userId ? (() => {
          const e = getAvatarEmoji(user.userId);
          return (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${e.bgClass}`}>
              {e.emoji}
            </div>
          );
        })() : null}

      <div className="flex-1 min-w-0">
        <p className="font-bold text-ink truncate">{user.userName}</p>
        <p className="text-xs text-ink/60 capitalize">{user.userRole} &middot; {user.userPointsTotal} pts</p>
      </div>

      {assignedUserIds.has(user.userId) && (
        <span className="font-bold px-2 py-0.5 rounded-full bg-grape/15 text-grape text-xs">
          Active
        </span>
      )}
    </div>
  );

  const handleDragLeave = useCallback(() => {
    setDragOverSlate(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, slateId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSlate(slateId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSlateId: string) => {
    e.preventDefault();
    const userId = e.dataTransfer.getData("userId");
    if (!userId) return;

    setDraggedUserId(null);
    setDragOverSlate(null);

    const slateToDropOn = slates.find((s) => s.id === targetSlateId);
    if (!slateToDropOn) return;

    // A drag that started on an existing assignment card moves that row; a drag
    // from the users sidebar only adds the person to the slate.
    const movedId = e.dataTransfer.getData("assignmentId");
    const fromSlateId = e.dataTransfer.getData("fromSlateId");
    const moved = movedId
      ? slates.flatMap((s) => s.assignments).find((a) => a.id === movedId)
      : undefined;

    let dropped: string | null = null;

    const newSlates = slates.map((slate) => {
      // The moved row leaves whichever slate it came from — a row that has no
      // id yet (not saved) is matched by its source slate and user instead.
      const remaining = slate.assignments.filter((a) => {
        if (moved) return a.id !== moved.id;
        return !(fromSlateId && fromSlateId !== targetSlateId && slate.id === fromSlateId && a.userId === userId);
      });

      if (slate.id !== targetSlateId) {
        return { ...slate, assignments: remaining.map((a, i) => ({ ...a, order: i + 1 })) };
      }

      const existingIndex = remaining.findIndex((a) => a.userId === userId);
      if (existingIndex >= 0) {
        // Already on this slate: drag to the end of the rotation cycle.
        const assignments = [...remaining];
        const [existing] = assignments.splice(existingIndex, 1);
        assignments.push(existing);
        return { ...slate, assignments: assignments.map((a, i) => ({ ...a, order: i + 1 })) };
      }

      if (moved) {
        dropped = moved.id ?? null;
        return {
          ...slate,
          assignments: [...remaining, { ...moved, slateId: targetSlateId }].map((a, i) => ({ ...a, order: i + 1 })),
        };
      }

      const userData = users.find((u) => u.userId === userId);
      const newUserRotation: UserRotation = {
        id: undefined,
        userId,
        slateId: targetSlateId,
        order: remaining.length + 1,
        intervalDays: 7,
        isActive: true,
        userName: userData?.userName ?? "",
        userAvatarUrl: userData?.userAvatarUrl ?? "",
        userPointsTotal: userData?.userPointsTotal ?? 0,
        userRole: userData?.userRole ?? "child",
      };
      return { ...slate, assignments: [...remaining, newUserRotation].map((a, i) => ({ ...a, order: i + 1 })) };
    });

    // If the moved row was deduplicated away (the person was already on the
    // target slate), it is a real delete rather than a move.
    if (moved?.id && dropped !== moved.id) {
      setRemovedIds((ids) => [...ids, moved.id as string]);
    }

    onSlatesChange(newSlates);
  }, [slates, users, onSlatesChange]);

  const handleRemoveAssignment = useCallback((assignmentId: string | undefined, userId: string, slateId: string) => {
    if (assignmentId) setRemovedIds((ids) => [...ids, assignmentId]);
    const newSlates = slates.map((slate) => {
      if (slate.id !== slateId) return slate;
      const assignmentsAfterRemove = slate.assignments.filter((a) => a.userId !== userId);
      const reordered = assignmentsAfterRemove.map((a, i) => ({ ...a, order: i + 1 }));
      return { ...slate, assignments: reordered };
    });
    onSlatesChange(newSlates);
  }, [slates, onSlatesChange]);

  const handleEditInterval = useCallback((slateId: string, userId: string, intervalDays: number) => {
    const next = Number.isFinite(intervalDays) && intervalDays >= 1 ? Math.floor(intervalDays) : 1;
    onSlatesChange(
      slates.map((slate) =>
        slate.id !== slateId
          ? slate
          : {
              ...slate,
              assignments: slate.assignments.map((a) =>
                a.userId === userId ? { ...a, intervalDays: next } : a,
              ),
            },
      ),
    );
  }, [slates, onSlatesChange]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");

    const allAssignments: RotationAssignment[] = slates.flatMap((slate) =>
      slate.assignments.map((assignment) => ({
        id: assignment.id,
        slateId: slate.id,
        userId: assignment.userId,
        order: assignment.order,
        intervalDays: assignment.intervalDays,
        isActive: assignment.isActive,
      })),
    );

    try {
      await onSave(allAssignments, removedIds);
      setRemovedIds([]);
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
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-ink/60 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Users size={14} />
            Users
          </h3>

          {adminUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink/40 uppercase tracking-wider mb-1">Admin</p>
              {adminUsers.map((user) => renderUser(user))}
            </div>
          )}

          {parentUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink/40 uppercase tracking-wider mb-1">Parents</p>
              {parentUsers.map((user) => renderUser(user))}
            </div>
          )}

          {childUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink/40 uppercase tracking-wider mb-1">Children</p>
              {childUsers.map((user) => renderUser(user))}
            </div>
          )}

          {users.length === 0 && (
            <p className="text-sm text-ink/60 italic p-3 text-center">No users to display</p>
          )}
        </div>

        {/* Slates Column */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-ink/60 uppercase tracking-wider mb-2 flex items-center gap-2">
            <PanelsLeftRight size={14} />
            Slates
          </h3>

          <div className="space-y-4">
            {slates.map((slate, slateIndex) => {
              const accent = accentStyles[slateIndex % accentStyles.length];
              return (
                <div
                  key={slate.id}
                  onDragOver={(e) => handleDragOver(e, slate.id)}
                  onDrop={(e) => handleDrop(e, slate.id)}
                  onDragLeave={handleDragLeave}
                  className={`bg-white rounded-2xl p-3 border-2 transition-all ${
                    dragOverSlate === slate.id ? accent.over : "border-ink/10 hover:border-grape/40"
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
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-bold border ${accent.badge}`}>
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
                        onDragEnd={() => setDraggedUserId(null)}
                        onEditInterval={(intervalDays: number) => {
                          handleEditInterval(slate.id, assignment.userId, intervalDays);
                        }}
                        onRemove={() => handleRemoveAssignment(assignment.id, assignment.userId, slate.id)}
                      />
                    ))}

                    {/* Empty drop zone indicator */}
                    {slate.assignments.length === 0 && (
                      <div className={`flex items-center justify-center py-4 text-sm border-2 border-dashed rounded-xl ${accent.zone}`}>
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

            {/* Drop zone for removing assignments - drag here to remove */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const userId = e.dataTransfer.getData("userId");
                if (!userId) return;
                
                setDraggedUserId(null);
                setDragOverSlate(null);
                
                const newSlates = slates.map((slate) => {
                  const assignmentsAfterRemove = slate.assignments.filter((a) => a.userId !== userId);
                  const reordered = assignmentsAfterRemove.map((a, i) => ({ ...a, order: i + 1 }));
                  return { ...slate, assignments: reordered };
                });
                onSlatesChange(newSlates);
              }}
              onDragLeave={(e) => e.preventDefault()}
              className={`mt-4 rounded-2xl border-2 border-dashed transition-all ${
                draggedUserId
                  ? "border-coral/50 bg-coral/10"
                  : "border-ink/10"
              }`}
            >
              <p className="text-center text-sm text-ink/40 py-6">
                {draggedUserId ? "Drop here to remove" : "Drag assignments here to remove"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving || slates.every((s) => s.assignments.length === 0)}
          className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full transition-all ${
            saving || saveStatus !== "idle"
              ? "bg-grape/50 cursor-wait"
              : "bg-grape hover:bg-grape/90 active:bg-grape/95 shadow-md shadow-grape/30 cursor-pointer"
          } text-white`}
        >
          {saving ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 24" stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
            </svg>
          ) : saveStatus === "success" ? (
            <svg className="w-4 h-4" viewBox="0 24" stroke="currentColor" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="5 12 9 16 17 8" />
            </svg>
          ) : (
            <Save size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
