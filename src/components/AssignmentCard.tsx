import { GripHorizontal } from "lucide-react";

export interface RotationAssignment {
  id?: string;
  slateId: string;
  userId: string;
  order: number;
  intervalDays: number;
  isActive: boolean;
}

export interface UserRotation extends RotationAssignment {
  userName: string;
  userAvatarUrl?: string;
  userPointsTotal: number;
  userRole: string;
}

export interface SlateWithRotations {
  id: string;
  name: string;
  description?: string;
  roomLocation?: string;
  frequency: string;
  interval: number;
  assignments: UserRotation[];
}

interface AssignmentCardProps {
  assignment: UserRotation;
  onDragStart: (e: React.DragEvent, userId: string) => void;
  onEditInterval: (intervalDays: number) => void;
  onRemove?: () => void;
}

export default function AssignmentCard({ assignment, onDragStart, onEditInterval }: AssignmentCardProps) {
  const avatarUrl = assignment.userAvatarUrl || `https://ui.boringavatars.com/badge/1/${assignment.userId.length}/flat`;

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border-2 border-ink/10 p-3 shadow-sm hover:shadow-md hover:border-grape/40 transition-all group">
      <span className="text-ink/30 cursor-grab active:cursor-grabbing" aria-hidden="true">
        <GripHorizontal size={16} />
      </span>

      <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" draggable={false} />

      <div className="flex-1 min-w-0">
        <p className="font-bold text-ink truncate">{assignment.userName}</p>
        <p className="text-xs text-ink/60 capitalize">{assignment.userRole} &middot; {assignment.userPointsTotal} pts</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <label htmlFor={`interval-${assignment.id}`} className="text-xs text-ink/60">Every</label>
        <input
          type="number"
          id={`interval-${assignment.id}`}
          min={1}
          value={assignment.intervalDays}
          onChange={(e) => onEditInterval(Number(e.target.value))}
          className="w-12 text-center text-sm rounded-md border-2 border-ink/10 bg-white focus:ring-grape focus:border-grape font-bold"
        />
        <span className="text-xs text-ink/60">days</span>
      </div>

      <span className="font-bold px-2 py-0.5 rounded-full bg-grape/15 text-grape text-xs border border-grape/20">
        #{assignment.order}
      </span>
    </div>
  );
}
