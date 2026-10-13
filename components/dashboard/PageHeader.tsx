import { cn } from "@/lib/utils";

/**
 * Dashboard page headline: small kicker line, big title with an optional
 * accent chip beside it, and optional actions on the right.
 */
export function PageHeader({
  kicker,
  title,
  chip,
  actions,
}: {
  kicker: string;
  title: string;
  chip?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div>
        <p className="text-muted-foreground text-sm">{kicker}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          {chip ?? null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

/** Orange accent chip used beside page titles. */
export function HeaderChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-orange-600/30 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-700 dark:border-orange-400/25 dark:text-orange-200",
        className,
      )}
    >
      {children}
    </span>
  );
}
