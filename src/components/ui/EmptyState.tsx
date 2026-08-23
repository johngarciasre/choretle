interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  message?: string;
}

export function EmptyState({ icon, title, message }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-grape/10 text-grape flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="font-display text-xl font-bold text-ink">{title}</h3>
      {message && <p className="text-ink/60 mt-1">{message}</p>}
    </div>
  );
}

export default EmptyState;
