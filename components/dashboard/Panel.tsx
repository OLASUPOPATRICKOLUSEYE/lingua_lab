import { cn } from "@/lib/utils";

/**
 * Feature surfaces for the dashboard tiles and practice passage cards.
 *
 * Both variants stay in the brand's warm family. The light values used to be
 * mint/blue and lavender/blue — cool pastels that fought the orange brand on
 * every other surface and made the dashboard read as a different product. The
 * saturation is deliberately low: these sit behind text and get looked at for a
 * whole lesson, so they should recede, not shout.
 */
export const TILE_GRADIENTS = [
  // Amber: cream into soft peach.
  "bg-[linear-gradient(135deg,#fdeedd,#fad7b4)] dark:bg-[linear-gradient(135deg,#6b2a12,#b4500f)]",
  // Clay: warm sand into muted terracotta.
  "bg-[linear-gradient(135deg,#fbe9e2,#f3cfbc)] dark:bg-[linear-gradient(135deg,#45200e,#8a3d19)]",
] as const;

/** Standard dashboard card surface. */
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        // Flat by design: the border alone separates the card from the ground.
        // The card token stays close to the background in tone, so keep that
        // border weight — dropping it leaves surfaces indistinct.
        "rounded-xl border bg-card p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Panel title row: orange icon chip, title, optional count badge and action. */
export function PanelHeader({
  icon,
  title,
  badge,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-primary/8 border-primary/15 flex size-11 items-center justify-center rounded-xl border">
          {icon}
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {badge ? (
          <span className="text-muted-foreground rounded-lg bg-muted px-3 py-1 text-sm">
            {badge}
          </span>
        ) : null}
      </div>
      {action ?? null}
    </div>
  );
}
