import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type IconProps = SVGProps<SVGSVGElement>;

function SvgFrame({ className, children, viewBox = "0 0 24 24", ...props }: IconProps) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export function ColorHomeIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="M4 10.5 12 4l8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" fill="#F7C66A" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M8.5 20v-5.25A1.75 1.75 0 0 1 10.25 13h3.5a1.75 1.75 0 0 1 1.75 1.75V20" fill="#7CD5C2" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M9 9.5h6" stroke="#1F1A17" strokeWidth="1.4" />
    </SvgFrame>
  );
}

export function ColorBookIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="M5.5 5.5h5.75A2.75 2.75 0 0 1 14 8.25V19H8.25A2.75 2.75 0 0 0 5.5 21z" fill="#9BD2FF" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M18.5 5.5h-5.75A2.75 2.75 0 0 0 10 8.25V19h5.75A2.75 2.75 0 0 1 18.5 21z" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M10 8.5h4" stroke="#1F1A17" strokeWidth="1.4" />
    </SvgFrame>
  );
}

export function ColorSettingsIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <circle cx="12" cy="12" r="5.1" fill="#B8A9FF" stroke="#1F1A17" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2" fill="#FFF7ED" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M12 3.8v2.1M12 18.1v2.1M20.2 12h-2.1M5.9 12H3.8M17.8 6.2l-1.5 1.5M7.7 16.3l-1.5 1.5M17.8 17.8l-1.5-1.5M7.7 7.7 6.2 6.2" stroke="#1F1A17" strokeWidth="1.4" />
    </SvgFrame>
  );
}

export function ColorSearchIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <circle cx="10.5" cy="10.5" r="5.25" fill="#95E0D0" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="m14.5 14.5 4.2 4.2" stroke="#1F1A17" strokeWidth="1.8" />
      <path d="M8.7 10.5h3.6" stroke="#1F1A17" strokeWidth="1.2" opacity=".7" />
    </SvgFrame>
  );
}

export function ColorActivityIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="4" y="5" width="16" height="14" rx="3" fill="#FDE68A" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M7.5 15.5V12M12 15.5V8.5M16.5 15.5v-5" stroke="#1F1A17" strokeWidth="1.8" />
      <circle cx="7.5" cy="12" r="1" fill="#7CD5C2" />
      <circle cx="12" cy="8.5" r="1" fill="#9BD2FF" />
      <circle cx="16.5" cy="10.5" r="1" fill="#B8A9FF" />
    </SvgFrame>
  );
}

export function ColorMicIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="8" y="4" width="8" height="11" rx="4" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M6.5 11.5a5.5 5.5 0 1 0 11 0" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M12 17v3M9 20h6" stroke="#1F1A17" strokeWidth="1.4" />
      <circle cx="12" cy="8" r="1.2" fill="#FFF7ED" opacity=".9" />
    </SvgFrame>
  );
}

export function ColorCalendarIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" fill="#C7F9F1" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M4 9.5h16" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M8 3.8v3.4M16 3.8v3.4" stroke="#1F1A17" strokeWidth="1.4" />
      <rect x="7.2" y="12" width="3.1" height="3.1" rx=".7" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.1" />
      <rect x="13.7" y="12" width="3.1" height="3.1" rx=".7" fill="#B8A9FF" stroke="#1F1A17" strokeWidth="1.1" />
    </SvgFrame>
  );
}

export function ColorClipboardIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="6" y="5" width="12" height="15" rx="2.5" fill="#B9D7FF" stroke="#1F1A17" strokeWidth="1.4" />
      <rect x="9" y="3.5" width="6" height="3.5" rx="1.4" fill="#FFF7ED" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M9 11h6M9 14.5h6" stroke="#1F1A17" strokeWidth="1.4" />
      <circle cx="8.6" cy="11" r=".7" fill="#7CD5C2" />
      <circle cx="8.6" cy="14.5" r=".7" fill="#FDBA74" />
    </SvgFrame>
  );
}

export function ColorClockIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <circle cx="12" cy="12" r="7.2" fill="#C7F9F1" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M12 8v4.2l2.9 2" stroke="#1F1A17" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1" fill="#FDBA74" />
    </SvgFrame>
  );
}

export function ColorSparklesIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" fill="#FDE68A" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="m18.2 14.7.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8zM5.3 14.2l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="#B8A9FF" stroke="#1F1A17" strokeWidth="1.1" />
    </SvgFrame>
  );
}

export function ColorUserIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <circle cx="12" cy="8.2" r="3.2" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M5 19a7 7 0 0 1 14 0v1H5z" fill="#9BD2FF" stroke="#1F1A17" strokeWidth="1.4" />
    </SvgFrame>
  );
}

export function ColorUsersIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <circle cx="9" cy="9" r="2.6" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.3" />
      <circle cx="15.8" cy="10.3" r="2.3" fill="#B8A9FF" stroke="#1F1A17" strokeWidth="1.3" />
      <path d="M4.7 19a5.2 5.2 0 0 1 8.6-3.9" fill="#9BD2FF" stroke="#1F1A17" strokeWidth="1.3" />
      <path d="M13.8 19a4.2 4.2 0 0 1 6.1-3" fill="#C7F9F1" stroke="#1F1A17" strokeWidth="1.3" />
    </SvgFrame>
  );
}

export function ColorSchoolIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <path d="M3.8 9 12 4l8.2 5L12 14z" fill="#FDE68A" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M6.5 12.7V18l5.5 2.2 5.5-2.2v-5.3" fill="#B9D7FF" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M20.2 9v5.5" stroke="#1F1A17" strokeWidth="1.4" />
      <circle cx="20.2" cy="15.8" r="1.2" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.2" />
    </SvgFrame>
  );
}

export function ColorBuildingIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="5" y="4.5" width="14" height="15.5" rx="2.5" fill="#B9D7FF" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M9 8.5h2v2H9zm4 0h2v2h-2zM9 12.5h2v2H9zm4 0h2v2h-2z" fill="#FFF7ED" stroke="#1F1A17" strokeWidth=".9" />
      <path d="M10 20v-3.5a2 2 0 0 1 4 0V20" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.3" />
    </SvgFrame>
  );
}

export function ColorDatabaseIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.8" fill="#B8A9FF" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M5.5 6.5v7c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-7" fill="#C7F9F1" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M5.5 10c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M5.5 13.5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8" stroke="#1F1A17" strokeWidth="1.4" />
    </SvgFrame>
  );
}

export function ColorQueueIcon(props: IconProps) {
  return (
    <SvgFrame {...props}>
      <rect x="4.5" y="5" width="15" height="14" rx="3" fill="#FDE68A" stroke="#1F1A17" strokeWidth="1.4" />
      <path d="M8 9.5h8M8 13h5" stroke="#1F1A17" strokeWidth="1.4" />
      <circle cx="16.8" cy="13" r="1.8" fill="#FDBA74" stroke="#1F1A17" strokeWidth="1.1" />
    </SvgFrame>
  );
}
