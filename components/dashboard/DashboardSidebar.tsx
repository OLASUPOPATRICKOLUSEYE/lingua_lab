"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@lingua/db";
import {
  ColorActivityIcon,
  ColorBookIcon,
  ColorClipboardIcon,
  ColorHomeIcon,
  ColorMicIcon,
  ColorSchoolIcon,
  ColorSettingsIcon,
} from "@/components/icons/ColorIcons";
import { cn } from "@/lib/utils";

interface DashboardSidebarProps {
  role: UserRole;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Nav for each role.
 *
 * Several of these routes existed but were unreachable from navigation — a
 * teacher had no link to their own classes, and an admin had none to
 * departments, teachers, students, or classes. They were only findable by
 * typing the URL or following a link from another page.
 */
function navGroupsForRole(role: UserRole): NavGroup[] {
  if (role === "student") {
    return [
      {
        label: null,
        items: [
          { href: "/student", label: "Home", icon: ColorHomeIcon },
          { href: "/student/assignments", label: "Practice", icon: ColorBookIcon },
          { href: "/student/recordings", label: "My recordings", icon: ColorMicIcon },
        ],
      },
      {
        label: "Account",
        items: [{ href: "/settings", label: "Settings", icon: ColorSettingsIcon }],
      },
    ];
  }

  if (role === "teacher") {
    return [
      {
        label: null,
        items: [
          { href: "/teacher", label: "Review", icon: ColorHomeIcon },
          { href: "/teacher/classes", label: "Classes", icon: ColorSchoolIcon },
        ],
      },
      {
        label: "Account",
        items: [{ href: "/settings", label: "Settings", icon: ColorSettingsIcon }],
      },
    ];
  }

  return [
    {
      label: null,
      items: [{ href: "/admin", label: "Operations", icon: ColorHomeIcon }],
    },
    {
      label: "School",
      items: [
        { href: "/admin/classes", label: "Classes", icon: ColorSchoolIcon },
        { href: "/admin/departments", label: "Departments", icon: ColorActivityIcon },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/admin/teachers", label: "Teachers", icon: ColorClipboardIcon },
        { href: "/admin/students", label: "Students", icon: ColorBookIcon },
        { href: "/admin/dept-heads", label: "Dept heads", icon: ColorMicIcon },
      ],
    },
    {
      label: "Account",
      items: [{ href: "/settings", label: "Settings", icon: ColorSettingsIcon }],
    },
  ];
}

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Role landing pages must match exactly, or "/student" would light up for
  // every page beneath it.
  if (href === "/student" || href === "/teacher" || href === "/admin") {
    return pathname === href;
  }
  return pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ role }: DashboardSidebarProps) {
  const pathname = usePathname();
  const groups = navGroupsForRole(role);

  return (
    <nav
      aria-label="Main"
      // Vertical on desktop; a single scrollable row on small screens, where a
      // fixed side rail would eat most of the width.
      className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-4 lg:overflow-visible"
    >
      {groups.map((group, index) => (
        <div key={group.label ?? `group-${index}`} className="flex gap-1 lg:flex-col">
          {group.label ? (
            <p className="text-muted-foreground hidden px-3 pb-1 text-[0.7rem] font-semibold tracking-[0.14em] uppercase lg:block">
              {group.label}
            </p>
          ) : null}

          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <Icon className="size-4.5 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
