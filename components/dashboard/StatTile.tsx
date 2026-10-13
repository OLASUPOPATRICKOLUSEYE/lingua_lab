import { cn } from "@/lib/utils";

/**
 * A single headline metric: big value, label, and optional secondary hint.
 * Shared across the admin / teacher / student consoles so numbers read the same
 * everywhere.
 */
export function StatTile({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.18em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "pt-2 text-3xl font-semibold tracking-tight tabular-nums sm:text-[2rem]",
          valueClassName,
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground pt-2 text-sm leading-5">{hint}</p>
      ) : null}
    </div>
  );
}
