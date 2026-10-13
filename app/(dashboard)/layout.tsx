import Link from "next/link";
import { cookies } from "next/headers";
import { verifySession, ROLE_HOME } from "@/utils/auth/dal";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { ColorSchoolIcon } from "@/components/icons/ColorIcons";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session] = await Promise.all([verifySession(), cookies()]);
  const roleLabel = session.role.replace("_", " ");

  return (
    <div className="dashboard-shell text-foreground flex min-h-full flex-1">
      {/* Real sidebar. This nav used to live INSIDE the header as a horizontal
          strip, so the component was named DashboardSidebar without ever being
          one. Below lg it stays a scrollable row — a fixed rail would take most
          of a phone's width. */}
      <aside className="border-border/60 bg-background/50 sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r px-3 py-4 lg:flex">
        <Link
          href={ROLE_HOME[session.role]}
          className="flex items-center gap-3 px-2 pb-6"
        >
          <span className="bg-background/70 flex size-9 items-center justify-center rounded-full border">
            <ColorSchoolIcon className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">RoutLang</span>
        </Link>

        <div className="flex-1 overflow-y-auto">
          <DashboardSidebar role={session.role} />
        </div>

        {/* Identity and sign-out anchored at the bottom, the conventional place
            to look for them once nav moves out of the header. */}
        <div className="border-border/60 mt-4 border-t pt-4">
          <p className="truncate px-2 text-sm leading-tight font-medium">
            {session.email}
          </p>
          <p className="text-muted-foreground px-2 text-xs leading-tight capitalize">
            {roleLabel}
          </p>
          <form action={logout} className="mt-3 px-2">
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/60 bg-background/78 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex w-full items-center justify-between gap-x-6 px-5 py-3.5 sm:px-8">
            <Link
              href={ROLE_HOME[session.role]}
              className="flex items-center gap-3 lg:hidden"
            >
              <span className="bg-background/70 flex size-9 items-center justify-center rounded-full border">
                <ColorSchoolIcon className="size-5" />
              </span>
              <span className="text-sm font-semibold tracking-tight">
                RoutLang
              </span>
            </Link>

            {/* Desktop keeps the header for page-level controls only. */}
            <div className="hidden lg:block" />

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <form action={logout} className="lg:hidden">
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          </div>

          {/* Small screens: the nav rides under the header instead of a rail. */}
          <div className="border-border/60 border-t px-5 py-2 sm:px-8 lg:hidden">
            <DashboardSidebar role={session.role} />
          </div>
        </header>

        <main className="dashboard-main w-full flex-1 px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
