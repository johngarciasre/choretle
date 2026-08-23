import { cn } from "@/lib/utils";

type Accent = "coral" | "teal" | "sunny" | "grape" | "bubblegum";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: Accent;
}

export function StatCard({ icon, label, value, accent = "coral" }: StatCardProps) {
  const accentColors = {
    coral: "bg-coral/15 text-coral",
    teal: "bg-teal/15 text-teal",
    sunny: "bg-sunny/15 text-sunny",
    grape: "bg-grape/15 text-grape",
    bubblegum: "bg-bubblegum/15 text-bubblegum",
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(59,47,99,0.08)] p-6">
      <div className="flex items-center gap-4">
        <div className={cn("rounded-xl w-14 h-14 flex items-center justify-center", accentColors[accent])}>
          {icon}
        </div>
        <div>
          <div className="font-display text-3xl font-bold text-ink">{value}</div>
          <div className="text-ink/60 text-sm mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default StatCard;
