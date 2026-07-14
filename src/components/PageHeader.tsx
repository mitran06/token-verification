export function BrandMark({ className = "h-9 w-9 text-lg" }: { className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg bg-maroon font-display font-bold text-white ${className}`}
    >
      A
    </span>
  );
}

export function PageHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-ink/10 pb-4">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <h1 className="font-display text-lg font-semibold leading-tight">{title}</h1>
          <div className="text-xs uppercase tracking-wide text-ink/40">
            Amrita Admissions · Verification queue
          </div>
        </div>
      </div>
      {right}
    </header>
  );
}
