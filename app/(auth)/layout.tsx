import Link from "next/link";
import { Ear, GraduationCap, Mic, ShieldCheck } from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: Mic,
    title: "Record against the real model",
    body: "Students read alongside their own teacher's voice, not a generic sample.",
  },
  {
    icon: Ear,
    title: "Word-by-word feedback",
    body: "Pronunciation scoring highlights exactly where a take needs another pass.",
  },
  {
    icon: ShieldCheck,
    title: "Self-hosted, your data",
    body: "Runs on your own infrastructure — nothing leaves the school's control.",
  },
];

function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="border-primary/25 bg-primary/12 flex size-10 items-center justify-center rounded-full border">
        <GraduationCap className="text-primary size-4.5" />
      </span>
      <span className="font-display text-xl tracking-tight">RoutLang</span>
    </Link>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1">
      {/* Branded panel — hidden below lg, where the compact header (below) carries the mark instead. */}
      <div className="dashboard-shell relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden px-12 py-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.22),transparent_70%)] blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-0 size-80 rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.16),transparent_70%)] blur-2xl"
        />

        <BrandMark className="relative" />

        <div className="relative flex flex-col gap-10">
          <p className="font-display text-3xl leading-tight tracking-tight text-balance">
            Speaking practice that sounds like your classroom.
          </p>

          <div className="flex flex-col gap-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="border-border bg-card/70 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border">
                  <Icon className="text-primary size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-muted-foreground mt-0.5 text-sm leading-5">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-muted-foreground relative text-xs">
          RoutLang — self-hosted school language learning platform.
        </p>
      </div>

      {/* Form column */}
      <div className="flex flex-1 flex-col">
        <div className="flex justify-center px-4 pt-8 pb-2 lg:hidden">
          <BrandMark />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 lg:py-16">
          {children}
        </div>
      </div>
    </div>
  );
}
