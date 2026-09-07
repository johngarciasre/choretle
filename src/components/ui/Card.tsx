import { cn } from "@/lib/utils";

type Accent = "coral" | "teal" | "sunny" | "grape" | "bubblegum" | "indigo" | "success";

interface CardProps {
  accent?: Accent;
  className?: string;
  children: React.ReactNode;
}

const accentBorders: Record<Accent, string> = {
  coral: "border-t-4 border-coral",
  sunny: "border-t-4 border-sunny",
  teal: "border-t-4 border-teal",
  grape: "border-t-4 border-grape",
  bubblegum: "border-t-4 border-bubblegum",
  indigo: "border-t-4 border-indigo",
  success: "border-t-4 border-teal",
};

export function Card({ accent, className, children }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] p-6",
        accent && accentBorders[accent],
        className
      )}
    >
      {children}
    </div>
  );
}

export default Card;
