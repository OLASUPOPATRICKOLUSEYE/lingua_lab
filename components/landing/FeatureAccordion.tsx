"use client";

import { useState } from "react";
import { Lock, Mic, Users2 } from "lucide-react";

const ITEMS = [
  {
    key: "recorder",
    icon: Mic,
    title: "A recorder designed for classroom reality",
    body: "Multiple takes, master-track practice, chunked upload, and a browser path that was chosen after the WaveSurfer spike failed on iPhone.",
  },
  {
    key: "workflow",
    icon: Users2,
    title: "Teacher workflow stays live even without AI",
    body: "Manual-tier schools still get a usable submission and review pipeline instead of an outage disguised as a product limitation.",
  },
  {
    key: "tenancy",
    icon: Lock,
    title: "Tenant boundaries are part of the value prop",
    body: "RLS-enforced school isolation, canonical storage paths, and append-only grading history are core to the platform, not hidden implementation details.",
  },
] as const;

/**
 * GitHub feature-accordion pattern: one item open at a time, height animated
 * with the grid-template-rows 0fr→1fr trick (.lp-disclosure), the "+" glyph
 * fading out on the open item, and the paired visual crossfading in from
 * scale(1.05) over 0.8s (.lp-xfade).
 */
export function FeatureAccordion() {
  const [open, setOpen] = useState(0);

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr]">
      <div>
        {ITEMS.map((item, i) => {
          const isOpen = i === open;
          const Icon = item.icon;
          return (
            <div key={item.key} className="border-b border-white/10">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(i)}
                className={`flex w-full items-center justify-between gap-4 py-4 text-left text-[0.98rem] font-semibold transition-colors duration-200 ${
                  isOpen ? "text-white" : "text-white/55 hover:text-white/80"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`size-4 shrink-0 ${isOpen ? "text-orange-300" : "text-white/40"}`} />
                  {item.title}
                </span>
                <span
                  aria-hidden
                  className="font-mono text-lg text-orange-300 transition-opacity duration-200"
                  style={{ opacity: isOpen ? 0 : 1 }}
                >
                  +
                </span>
              </button>
              <div className="lp-disclosure" data-open={isOpen}>
                <div>
                  <p className="pr-8 pb-5 text-sm leading-7 text-white/60">{item.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative aspect-[16/11] overflow-hidden rounded-[1.2rem] border border-white/10 sm:aspect-[16/9]">
        <div className="lp-xfade absolute inset-0" data-current={open === 0}>
          <RecorderVisual />
        </div>
        <div className="lp-xfade absolute inset-0" data-current={open === 1}>
          <WorkflowVisual />
        </div>
        <div className="lp-xfade absolute inset-0" data-current={open === 2}>
          <TenancyVisual />
        </div>
      </div>
    </div>
  );
}

function RecorderVisual() {
  const bars = [22, 40, 62, 48, 74, 92, 66, 50, 78, 96, 70, 44, 60, 84, 54, 34];
  return (
    <div className="flex h-full flex-col justify-center gap-5 bg-[linear-gradient(135deg,#1d1108,#3a1d0a)] px-8">
      <div className="flex items-end gap-1.5">
        {bars.map((height, i) => (
          <span
            key={i}
            className="flex-1 rounded-full bg-gradient-to-t from-orange-600/70 to-amber-300"
            style={{ height: `${height * 0.9}px` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-orange-200/80">
        <span>master track ↔ student take</span>
        <span>drift 0.0ms</span>
      </div>
    </div>
  );
}

function WorkflowVisual() {
  const rows = [
    ["Submission received", "pending"],
    ["AI service unreachable", "→ pending_review"],
    ["Teacher grades manually", "graded"],
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-3 bg-[linear-gradient(135deg,#08160f,#0d2b1c)] px-8">
      {rows.map(([label, status]) => (
        <div
          key={label}
          className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-4 py-3 text-sm"
        >
          <span className="text-white/80">{label}</span>
          <span className="font-mono text-xs text-emerald-300">{status}</span>
        </div>
      ))}
      <p className="mt-1 font-mono text-xs text-emerald-200/60">
        a missing AI service is a Tuesday, not a 500
      </p>
    </div>
  );
}

function TenancyVisual() {
  return (
    <div className="flex h-full items-center justify-center gap-6 bg-[linear-gradient(135deg,#171310,#2b2014)] px-8">
      {["School A", "School B"].map((school) => (
        <div
          key={school}
          className="flex-1 rounded-xl border border-amber-400/30 bg-black/30 px-4 py-6 text-center"
        >
          <Lock className="mx-auto size-5 text-amber-300" />
          <div className="mt-3 text-sm font-semibold text-white/85">{school}</div>
          <div className="mt-1 font-mono text-[0.66rem] text-white/40">
            auth.jwt() ↔ school_id
          </div>
        </div>
      ))}
    </div>
  );
}
