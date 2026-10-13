import type { Metadata } from "next";
import Link from "next/link";
import { SpikeHarness } from "@/components/recorder/SpikeHarness";

export const metadata: Metadata = {
  title: "Web Audio + Canvas recorder spike — RoutLang",
};

/**
 * Public spike harness route for the recorder fallback path. WaveSurfer has
 * already failed the iPhone gate, so this route now validates the custom Web
 * Audio + Canvas approach against the same latency and sync thresholds.
 */
export default function SpikeRecorderPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Web Audio + Canvas recorder spike
        </h1>
        <p className="text-muted-foreground text-sm">
          Fallback validation for the recorder path after the WaveSurfer no-go.
          Thresholds remain first-pixel latency &lt; 200ms and dual-track sync
          ≤ ±20ms.
        </p>
        <p className="text-muted-foreground text-sm">
          Looking for the working recorder UI instead of the spike harness? Use{" "}
          <Link href="/spike/recorder-demo" className="text-foreground underline-offset-4 hover:underline">
            /spike/recorder-demo
          </Link>
          .
        </p>
      </header>
      <SpikeHarness />
    </div>
  );
}
