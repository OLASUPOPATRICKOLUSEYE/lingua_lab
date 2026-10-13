"use client";

import { useState } from "react";
import { AudioRecorder } from "@/components/recorder/AudioRecorder";
import { DualTrackPlayer } from "@/components/recorder/DualTrackPlayer";
import type { RecorderActivityConfig, RecorderTake } from "@/components/recorder/recorder-utils";

const DEMO_ACTIVITY: RecorderActivityConfig = {
  id: "spike-recorder-demo",
  prompt: "Read the demo passage, then compare your response against the teacher reference.",
  targetLanguage: "English",
  passageTitle: "Recorder demo passage",
  passageText:
    "This is a short demo passage for the recorder. Read it clearly, keep a steady pace, and submit the version you want reviewed.",
  teacherName: "Demo teacher",
  teacherReferenceText:
    "This is a short demo passage for the recorder. Read it clearly, keep a steady pace, and submit the version you want reviewed.",
  submissionModes: ["audio", "video"],
  timeLimitSeconds: 60,
};

export function RecorderDemo() {
  const [selectedTake, setSelectedTake] = useState<RecorderTake | null>(null);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <AudioRecorder
        activity={DEMO_ACTIVITY}
        selectedTakeId={selectedTake?.id ?? null}
        onSelectedTakeChange={setSelectedTake}
      />
      <DualTrackPlayer
        selectedTake={selectedTake}
        referenceText={DEMO_ACTIVITY.prompt}
      />
    </div>
  );
}
