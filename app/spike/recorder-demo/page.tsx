import type { Metadata } from "next";
import { RecorderDemo } from "@/components/recorder/RecorderDemo";

export const metadata: Metadata = {
  title: "Recorder Demo — RoutLang",
};

export default function RecorderDemoPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Recorder Demo</h1>
        <p className="text-muted-foreground text-sm">
          Working Weeks 3–4 demo on the validated Web Audio + Canvas path. This
          route records locally, lets you choose a take, plays it against the
          master track under one shared clock, and exercises chunked upload with a
          server-side TODO boundary.
        </p>
      </header>
      <RecorderDemo />
    </div>
  );
}
