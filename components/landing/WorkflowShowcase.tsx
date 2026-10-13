"use client";

const WAVEFORM = [
  18, 34, 52, 40, 64, 82, 58, 44, 70, 90, 62, 38, 54, 76, 48, 30, 60, 84, 56,
  36, 26, 46, 68, 42, 22,
];

export function WorkflowShowcase() {
  return (
    <div className="relative mt-16 h-[560px] w-full overflow-hidden rounded-[0.95rem] border border-white/10 bg-[linear-gradient(180deg,#1a110b_0%,#17100d_42%,#12100e_100%)] shadow-[0_30px_90px_rgba(0,0,0,0.4)] sm:mt-20 sm:h-[640px] lg:h-[700px]">
      <RecorderSurface />
    </div>
  );
}

function RecorderSurface() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-5 py-3">
        <span className="text-[0.68rem] font-semibold tracking-[0.18em] text-white/55 uppercase">
          Student recorder
        </span>
        <span className="flex items-center gap-2 text-xs text-orange-100/85">
          <span className="size-2 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.9)]" />
          REC 00:42 / 01:30
        </span>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden px-4 py-4 sm:px-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[18%] top-[14%] h-[48%] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.34)_0%,rgba(251,146,60,0.18)_34%,transparent_72%)] blur-3xl"
        />

        <div className="relative flex flex-1 items-center gap-[3px] sm:gap-1">
          {WAVEFORM.map((height, i) => (
            <span
              key={i}
              className="lp-wave-bar flex-1 rounded-full bg-gradient-to-t from-orange-700 via-orange-500 to-amber-200 shadow-[0_0_18px_rgba(249,115,22,0.14)]"
              style={{
                height: `${Math.max(height, 26)}%`,
                animationDelay: `${(i % 7) * 0.08}s`,
                animationDuration: `${1.15 + (i % 5) * 0.08}s`,
              }}
            />
          ))}
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[0.68rem] sm:text-xs">
          {["Take 1", "Take 2"].map((take) => (
            <span
              key={take}
              className="rounded-full border border-white/12 bg-white/4 px-3 py-1 text-white/55"
            >
              {take}
            </span>
          ))}
          <span className="rounded-full border border-orange-400/50 bg-orange-500/18 px-3 py-1 text-orange-100 shadow-[0_0_18px_rgba(249,115,22,0.18)]">
            Take 3 · selected
          </span>
          <span className="flex items-center gap-1.5 text-orange-100/55 sm:ml-auto">
            only the selected take uploads
          </span>
        </div>
      </div>
    </div>
  );
}
