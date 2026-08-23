interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">{title}</h1>
      {subtitle && <p className="text-ink/60 mt-1">{subtitle}</p>}
      {actions && (
        <div className="flex gap-2 mt-4">{actions}</div>
      )}
    </div>
  );
}

export default PageHeader;
