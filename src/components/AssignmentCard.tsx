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
    <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 border border-gray-200 dark:border-gray-700 transition-shadow hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 group">
      <span className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing" aria-hidden="true">
        <GripHorizontal size={16} />
      </span>

      <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" draggable={false} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{assignment.userName}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{assignment.userRole} &middot; {assignment.userPointsTotal} pts</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <label htmlFor={`interval-${assignment.id}`} className="text-xs text-gray-500 dark:text-gray-400">Every</label>
        <input
          type="number"
          id={`interval-${assignment.id}`}
          min={1}
          value={assignment.intervalDays}
          onChange={(e) => onEditInterval(Number(e.target.value))}
          className="w-12 text-center text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">days</span>
      </div>

      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
        #{assignment.order}
      </span>
    </div>
  );
}
