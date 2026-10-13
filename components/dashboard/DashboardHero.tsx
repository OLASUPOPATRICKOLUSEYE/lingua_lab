export function DashboardHero({
  eyebrow,
  title,
  description,
  accent,
  meta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  accent?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border bg-card p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(251,146,60,0.1),transparent_42%)]"
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="text-[0.7rem] font-semibold tracking-[0.22em] text-orange-600 uppercase dark:text-orange-300">
            {eyebrow}
          </p>
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-[2.4rem]">
            {title}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-6 sm:text-base">
            {description}
          </p>
          {meta ? <div className="flex flex-wrap gap-2 pt-1">{meta}</div> : null}
        </div>
        {accent ? (
          <div className="grid min-w-55 gap-3 rounded-lg border bg-background/60 p-4">
            {accent}
          </div>
        ) : null}
      </div>
    </section>
  );
}
