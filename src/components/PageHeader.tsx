export function BrandMark({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    // Amrita logo (public/amrita-logo.png). Plain <img> so it works from /public
    // without next/image sizing constraints.
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/amrita-logo.png" alt="Amrita Vishwa Vidyapeetham" className={`shrink-0 ${className}`} />
  );
}

export function PageHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-ink/10 pb-4">
      <div className="flex items-center gap-3">
        <BrandMark className="h-9 w-auto" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">{title}</h1>
          <div className="text-xs uppercase tracking-wide text-ink/40">
            Amrita Admissions · Verification queue
          </div>
        </div>
      </div>
      {right}
    </header>
  );
}
