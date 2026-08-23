"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "todo" | "doing" | "done" | "points" | "neutral";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: Status;
  children: React.ReactNode;
}

const badgeStyles = {
  todo: "bg-ink/10 text-ink",
  doing: "bg-sunny text-ink",
  done: "bg-teal text-white",
  points: "bg-sunny text-ink",
  neutral: "bg-grape/15 text-grape",
};

export function Badge({ status = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "rounded-full font-bold text-xs px-3 py-1 flex items-center gap-1.5",
        badgeStyles[status],
        className
      )}
      {...props}
    >
      {status === "points" && <Star size={12} fill="currentColor" />}
      {children}
    </div>
  );
}

interface TagPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: React.ReactNode;
}

export function TagPill({ active, className, onClick, children, ...props }: TagPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-bold transition",
        active
          ? "bg-grape text-white shadow-md shadow-grape/30"
          : "bg-white text-ink border-2 border-ink/10 hover:border-grape/40",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default Badge;
