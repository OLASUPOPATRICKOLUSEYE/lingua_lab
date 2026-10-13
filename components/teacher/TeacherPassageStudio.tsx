"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  CirclePlay,
  FileText,
  FileUp,
  Mic,
  RotateCcw,
  Save,
  Square,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GRADING_BY_TIER,
  LANGUAGE_GROUPS,
  findLanguage,
  speechLocale,
} from "@/utils/languages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TeacherStudioActivity } from "@/utils/teacher/activity-data";

const DEFAULT_LANGUAGE = "French";

/**
 * Studio sections, shown as a rail rather than stacked panels.
 *
 * Only "details" is required — the rail surfaces that (and whether a model
 * recording already exists) without the teacher opening anything.
 */
const STUDIO_PANES = [
  { id: "details" as const, label: "Lesson details", icon: FileText },
  { id: "listen" as const, label: "Hear it read aloud", icon: Volume2 },
  { id: "record" as const, label: "Record your voice", icon: Mic },
];

type StudioPane = (typeof STUDIO_PANES)[number]["id"];
const DEFAULT_PASSAGE_TITLE = "Morning station passage";
const DEFAULT_PASSAGE_TEXT =
  "Ce matin, Amina arrive a la gare tres tot. Elle regarde le tableau, trouve son train, puis elle attend calmement sur le quai.";
const DEFAULT_COACH_NOTE =
  "Keep the phrases connected and model the endings clearly for the students.";


function renderHighlightedPassage(text: string, activeCharIndex: number | null) {
  const tokens = text.split(/(\s+)/);
  let cursor = 0;

  return tokens.map((token, index) => {
    const start = cursor;
    const end = cursor + token.length;
    cursor = end;

    if (/^\s+$/.test(token)) {
      return <span key={`space-${index}`}>{token}</span>;
    }

    const isActive =
      activeCharIndex !== null && activeCharIndex >= start && activeCharIndex < end;

    return (
      <span
        key={`token-${index}`}
        className={
          isActive
            ? "rounded-md bg-orange-200 px-1 text-foreground dark:bg-orange-500/25"
            : undefined
        }
      >
        {token}
      </span>
    );
  });
}

interface ReferenceTake {
  id: string;
  objectUrl: string;
  durationMs: number;
  createdAt: number;
  blob: Blob;
}

export function TeacherPassageStudio({
  initialActivity,
  classTarget,
}: {
  initialActivity?: TeacherStudioActivity | null;
  classTarget?: {
    id: string;
    name: string;
    slug: string;
  };
}) {
  const [language, setLanguage] = useState<string>(
    initialActivity?.targetLanguage ?? DEFAULT_LANGUAGE,
  );
  const [passageTitle, setPassageTitle] = useState(
    initialActivity?.title ?? DEFAULT_PASSAGE_TITLE,
  );
  const [passageText, setPassageText] = useState(
    initialActivity?.passageText ?? DEFAULT_PASSAGE_TEXT,
  );
  const [coachNote, setCoachNote] = useState(
    initialActivity?.coachNote ?? DEFAULT_COACH_NOTE,
  );
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  // Status strings kept for the record/preview handlers' internal messaging;
  // no longer surfaced in the simplified UI (the one status line drives it).
  const [, setPlayStatus] = useState("");
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [, setRecordStatus] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [pane, setPane] = useState<StudioPane>("details");
  const [takes, setTakes] = useState<ReferenceTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [publishedActivityId, setPublishedActivityId] = useState(
    initialActivity?.id ?? null,
  );
  const [existingReferenceAudioUrl, setExistingReferenceAudioUrl] = useState<string | null>(
    initialActivity?.referenceAudioUrl ?? null,
  );
  const [audioSaveStatus, setAudioSaveStatus] = useState("");
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [existingReferenceVideoUrl, setExistingReferenceVideoUrl] = useState<string | null>(
    initialActivity?.referenceVideoUrl ?? null,
  );
  const [videoSaveStatus, setVideoSaveStatus] = useState(
    initialActivity?.referenceVideoUrl
      ? "A reference video is live. Upload a new clip to replace it."
      : "Publish the passage first, then upload a short video of your mouth so students can compare mouth position.",
  );
  const [videoUploadPercent, setVideoUploadPercent] = useState<number | null>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<{ url: string; blob: Blob } | null>(null);
  // Single status line for the one-button "create/update lesson" flow.
  const [missionStatus, setMissionStatus] = useState<string>("");
  const [isCreatingMission, setIsCreatingMission] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number | null>(null);
  // Dedicated to the reference-VIDEO recorder so it never collides with the
  // audio recorder's refs above.
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      videoStreamRef.current?.getTracks().forEach((track) => track.stop());
      takes.forEach((take) => URL.revokeObjectURL(take.objectUrl));
    };
  }, [takes]);

  function stopPreview() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsPlayingPreview(false);
    setActiveCharIndex(null);
    setPlayStatus("Preview stopped.");
  }

  function playPreview() {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setPlayStatus("Preview is not available in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(passageText);
    utterance.lang = speechLocale(language);
    utterance.rate = 0.9;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()),
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      setIsPlayingPreview(true);
      setActiveCharIndex(0);
      setPlayStatus("Preview playing from the start.");
    };

    utterance.onboundary = (event) => {
      if (typeof event.charIndex === "number") {
        setActiveCharIndex(event.charIndex);
      }
    };

    utterance.onend = () => {
      utteranceRef.current = null;
      setIsPlayingPreview(false);
      setActiveCharIndex(null);
      setPlayStatus("Preview finished.");
    };

    utterance.onerror = () => {
      utteranceRef.current = null;
      setIsPlayingPreview(false);
      setActiveCharIndex(null);
      setPlayStatus("Preview could not start in this browser.");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  async function startRecordingReference() {
    if (!window.isSecureContext) {
      setRecordStatus("Recording only works on a secure page connection.");
      return;
    }

    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setRecordStatus("This browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        const durationMs = performance.now() - (startedAtRef.current ?? performance.now());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const take = {
          id: crypto.randomUUID(),
          objectUrl: URL.createObjectURL(blob),
          durationMs,
          createdAt: Date.now(),
          blob,
        };

        setTakes((current) => [take, ...current]);
        setSelectedTakeId(take.id);
        setRecordStatus("Rehearsal take saved locally. Select the best take for this passage.");
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      startedAtRef.current = performance.now();
      setIsRecording(true);
      setRecordStatus("Recording your teacher model...");
      recorder.start();
    } catch (error) {
      setRecordStatus(`Microphone access failed: ${(error as Error).message}`);
    }
  }

  function stopRecordingReference() {
    mediaRecorderRef.current?.stop();
  }

  async function importPassageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setPassageText(text.trim());
    setPlayStatus("Passage imported. Preview it or record your own model next.");
    event.target.value = "";
  }

  /**
   * The one-button flow. Creates (or updates) the lesson, attaches whatever
   * model the teacher added, and assigns it to this class — in one sequence,
   * using the id returned by the create call so nothing depends on state timing.
   * All the "publish → attach → assign" machinery is hidden behind this.
   */
  async function createMission() {
    if (!passageTitle.trim() || !passageText.trim()) {
      setMissionStatus("Add a title and the passage text first.");
      return;
    }

    setIsCreatingMission(true);
    const editing = Boolean(publishedActivityId);
    setMissionStatus(editing ? "Saving your lesson…" : "Creating your lesson…");

    try {
      // 1) Create or update the lesson.
      const activityResponse = await fetch(
        publishedActivityId ? `/api/activities/${publishedActivityId}` : "/api/activities",
        {
          method: publishedActivityId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            passageTitle,
            targetLanguage: language,
            passageText,
            coachNote,
          }),
        },
      );
      const activityPayload = (await activityResponse.json().catch(() => null)) as
        | { error?: string; activity?: { id?: string } }
        | null;
      if (!activityResponse.ok || !activityPayload?.activity?.id) {
        throw new Error(activityPayload?.error ?? "Could not save your lesson.");
      }
      const activityId = activityPayload.activity.id;
      setPublishedActivityId(activityId);

      // 2) Attach the voice model, if the teacher recorded one this session.
      if (selectedTake) {
        setMissionStatus("Adding your voice recording…");
        const audioForm = new FormData();
        audioForm.append(
          "file",
          selectedTake.blob,
          `reference.${selectedTake.blob.type.split(";")[0]?.split("/")[1] ?? "webm"}`,
        );
        const audioResponse = await fetch(
          `/api/activities/${activityId}/reference-audio`,
          { method: "POST", body: audioForm },
        );
        if (audioResponse.ok) {
          const p = (await audioResponse.json().catch(() => null)) as
            | { referenceAudioUrl?: string }
            | null;
          setExistingReferenceAudioUrl(p?.referenceAudioUrl ?? null);
        }
      }

      // 3) Attach the video model, if the teacher recorded/added one.
      if (recordedVideo) {
        setMissionStatus("Adding your video…");
        await uploadReferenceVideo(recordedVideo.blob, activityId);
      }

      // 4) Give the class access.
      if (classTarget) {
        setMissionStatus(`Sharing with ${classTarget.name}…`);
        const assignmentResponse = await fetch(
          `/api/activities/${activityId}/assignments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ classId: classTarget.id, dueAt: null }),
          },
        );
        if (!assignmentResponse.ok) {
          const assignmentPayload = (await assignmentResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            assignmentPayload?.error ??
              `Lesson was saved, but sharing with ${classTarget.name} failed. Try again.`,
          );
        }
      }

      setMissionStatus(
        classTarget
          ? `Done — your lesson is live for ${classTarget.name}.`
          : "Done — your lesson is saved.",
      );
    } catch (error) {
      setMissionStatus((error as Error).message);
    } finally {
      setIsCreatingMission(false);
    }
  }

  async function uploadReferenceAudio() {
    if (!publishedActivityId) {
      setAudioSaveStatus("Publish the passage before attaching reference audio.");
      return;
    }
    if (!selectedTake) {
      setAudioSaveStatus("Select a rehearsal take first.");
      return;
    }

    setIsUploadingReference(true);
    setAudioSaveStatus("Attaching teacher reference audio...");

    try {
      const formData = new FormData();
      formData.append(
        "file",
        selectedTake.blob,
        `reference.${
          selectedTake.blob.type.split(";")[0]?.split("/")[1] ?? "webm"
        }`,
      );

      const response = await fetch(
        `/api/activities/${publishedActivityId}/reference-audio`,
        {
          method: "POST",
          body: formData,
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; referenceAudioUrl?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not attach reference audio.");
      }

      setExistingReferenceAudioUrl(payload?.referenceAudioUrl ?? null);
      setAudioSaveStatus(
        "Teacher reference audio attached. Students will now hear the recorded model instead of the guided browser voice.",
      );
    } catch (error) {
      setAudioSaveStatus((error as Error).message);
    } finally {
      setIsUploadingReference(false);
    }
  }

  // Shared by the file picker, an on-platform recorded take, and the one-button
  // create flow (which passes the freshly created id explicitly). A File is a
  // Blob, so every source flows through the same chunked upload.
  async function uploadReferenceVideo(source: Blob, activityIdOverride?: string) {
    const activityId = activityIdOverride ?? publishedActivityId;
    if (!activityId) {
      setVideoSaveStatus("Save the lesson before adding a video.");
      return;
    }
    const mimeType = source.type.split(";")[0]?.trim().toLowerCase();
    if (mimeType !== "video/webm" && mimeType !== "video/mp4") {
      setVideoSaveStatus("The video must be a .webm or .mp4 file.");
      return;
    }

    const chunkSize = 5 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(source.size / chunkSize));
    const uploadId = crypto.randomUUID();

    setVideoUploadPercent(0);
    setVideoSaveStatus("Uploading reference video...");

    type ReferenceVideoUploadResponse = {
      referenceVideoUrl?: string;
      error?: string;
    } | null;

    try {
      let lastPayload: ReferenceVideoUploadResponse = null;
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const chunk = source.slice(start, start + chunkSize);
        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("totalChunks", String(totalChunks));
        formData.append("mimeType", source.type);
        formData.append("chunk", chunk, `chunk-${chunkIndex}`);

        const response = await fetch(
          `/api/activities/${activityId}/reference-video`,
          { method: "POST", body: formData },
        );
        lastPayload = (await response
          .json()
          .catch(() => null)) as ReferenceVideoUploadResponse;
        if (!response.ok) {
          throw new Error(lastPayload?.error ?? "Could not upload the reference video.");
        }
        setVideoUploadPercent(Math.round(((chunkIndex + 1) / totalChunks) * 100));
      }

      setExistingReferenceVideoUrl(lastPayload?.referenceVideoUrl ?? null);
      setVideoSaveStatus(
        "Reference video attached. Students can now compare their mouth position against your model.",
      );
    } catch (error) {
      setVideoSaveStatus((error as Error).message);
    } finally {
      setVideoUploadPercent(null);
    }
  }

  function pickVideoMimeType(): string {
    // WebM everywhere it is supported (Chrome/Firefox); Safari falls back to MP4.
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "video/webm";
  }

  async function startRecordingReferenceVideo() {
    if (!window.isSecureContext) {
      setVideoSaveStatus("Recording only works on a secure page connection.");
      return;
    }
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setVideoSaveStatus("This browser does not support camera recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      videoStreamRef.current = stream;
      // Live self-view so the teacher can frame their mouth before/while recording.
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        void videoPreviewRef.current.play().catch(() => {});
      }

      const mimeType = pickVideoMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        setRecordedVideo((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(blob), blob };
        });
        setIsRecordingVideo(false);
        setVideoSaveStatus("Recorded. Preview it, then save it as the reference video — or record again.");
        stream.getTracks().forEach((track) => track.stop());
        videoStreamRef.current = null;
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
      };

      videoRecorderRef.current = recorder;
      setIsRecordingVideo(true);
      setVideoSaveStatus("Recording your mouth model… read the passage, then stop.");
      recorder.start();
    } catch (error) {
      setVideoSaveStatus(`Camera access failed: ${(error as Error).message}`);
    }
  }

  function stopRecordingReferenceVideo() {
    videoRecorderRef.current?.stop();
  }

  function resetDraft() {
    setPassageTitle(DEFAULT_PASSAGE_TITLE);
    setLanguage(DEFAULT_LANGUAGE);
    setPassageText(DEFAULT_PASSAGE_TEXT);
    setCoachNote(DEFAULT_COACH_NOTE);
    setPublishedActivityId(null);
    setExistingReferenceAudioUrl(null);
    setExistingReferenceVideoUrl(null);
    setSelectedTakeId(null);
    setRecordedVideo(null);
    setMissionStatus("");
  }

  const selectedTake = takes.find((take) => take.id === selectedTakeId) ?? null;

  return (
    <section className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
      {/* Section rail. One pane at a time: the studio previously showed the
          lesson form and the whole recording studio simultaneously, which is a
          lot to hold in view when the required work is three fields. */}
      <aside className="bg-card rounded-2xl border p-2 lg:sticky lg:top-4">
        <nav className="flex gap-1 lg:flex-col">
          {STUDIO_PANES.map((item) => {
            const active = pane === item.id;
            const status =
              item.id === "record"
                ? existingReferenceAudioUrl || existingReferenceVideoUrl
                  ? "Added"
                  : "Optional"
                : item.id === "listen"
                  ? "Optional"
                  : "Required";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPane(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <item.icon
                  className={`size-4 shrink-0 ${active ? "text-primary" : ""}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="hidden text-xs lg:block">{status}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        {pane === "details" ? (
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            {publishedActivityId ? "Edit this lesson" : "New lesson"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Write the passage your students will read aloud
            {classTarget ? ` for ${classTarget.name}` : ""}. Adding your own
            recording is optional. When you&apos;re ready, one button creates it
            and shares it with the class.
          </p>

          <div className="mt-6 grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="passage-title">
                <span className="text-muted-foreground mr-2 font-normal">1.</span>
                Lesson name
              </Label>
              <Input
                id="passage-title"
                placeholder="e.g. Morning at the station"
                value={passageTitle}
                onChange={(event) => setPassageTitle(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="target-language">Language</Label>
              {/* Grouped by what grading each language actually gets, so the
                  teacher sees the trade-off while choosing rather than after
                  the first set of scores comes back. */}
              <select
                id="target-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="border-input bg-background/70 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] md:text-sm"
              >
                {LANGUAGE_GROUPS.map((group) => (
                  <optgroup key={group.tier} label={group.label}>
                    {group.languages.map((option) => (
                      <option key={option.code} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-muted-foreground text-sm">
                {GRADING_BY_TIER[findLanguage(language)?.tier ?? "transcription"]}
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="passage-text">
                  <span className="text-muted-foreground mr-2 font-normal">2.</span>
                  What students read aloud
                </Label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5 text-sm">
                  <FileUp className="size-4" />
                  Import from file
                  <input
                    type="file"
                    accept=".txt,.md,.doc"
                    className="hidden"
                    onChange={importPassageFile}
                  />
                </label>
              </div>
              <Textarea
                id="passage-text"
                placeholder="Paste or type the passage here…"
                value={passageText}
                onChange={(event) => setPassageText(event.target.value)}
                className="min-h-52"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="coach-note">
                <span className="text-muted-foreground mr-2 font-normal">3.</span>
                A tip for students{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="coach-note"
                placeholder="e.g. Take your time on the endings of each sentence."
                value={coachNote}
                onChange={(event) => setCoachNote(event.target.value)}
                className="min-h-24"
              />
            </div>
          </div>

          <div className="mt-6 border-t pt-5">
            <Button
              type="button"
              size="lg"
              onClick={createMission}
              disabled={isCreatingMission || !passageTitle.trim() || !passageText.trim()}
              className="w-full sm:w-auto"
            >
              <Save className="size-4" />
              {isCreatingMission
                ? "Working…"
                : publishedActivityId
                  ? "Save lesson"
                  : classTarget
                    ? `Create lesson for ${classTarget.name}`
                    : "Create lesson"}
            </Button>
            {missionStatus ? (
              <p className="text-muted-foreground mt-3 text-sm leading-6">
                {missionStatus}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {publishedActivityId ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/teacher/activities/${publishedActivityId}/preview`}>
                    See how students will view it
                  </Link>
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
                <RotateCcw className="size-4" />
                Clear and start over
              </Button>
            </div>
          </div>
        </div>


        ) : null}

        {pane === "listen" ? (
          <div className="bg-card rounded-2xl border p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Volume2 className="text-primary size-4" />
          <p className="text-sm font-medium">Hear it read aloud</p>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">
          {passageTitle || "Your lesson"}
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Play the passage to check how it sounds before you record your own model.
        </p>

        <div className="mt-4 rounded-2xl border bg-background/70 p-4 text-[15px] leading-8">
          <p className="text-foreground">{renderHighlightedPassage(passageText, activeCharIndex)}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={playPreview}>
            <CirclePlay className="size-4" />
            Play
          </Button>
          <Button type="button" variant="outline" onClick={stopPreview} disabled={!isPlayingPreview}>
            <Square className="size-4" />
            Stop
          </Button>
        </div>
          </div>
        ) : null}

        {pane === "record" ? (
          <div className="bg-card rounded-2xl border p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Mic className="text-primary size-4" />
          <p className="text-sm font-medium">
            Record your voice{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </p>
        </div>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Read the passage yourself so students can hear how it should sound.
          If you skip this, they&apos;ll hear a computer voice instead.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={startRecordingReference} disabled={isRecording}>
            <Mic className="size-4" />
            Start recording
          </Button>
          <Button type="button" variant="secondary" onClick={stopRecordingReference} disabled={!isRecording}>
            <Square className="size-4" />
            Stop
          </Button>
        </div>

        {selectedTake ? (
          <div className="mt-5 rounded-xl border bg-background/70 p-4">
            <p className="text-sm font-medium">Your recording</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              It&apos;s saved with the lesson when you press the create/save
              button above.
            </p>
            <audio controls src={selectedTake.objectUrl} className="mt-3 w-full" />
            {publishedActivityId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={uploadReferenceAudio}
                disabled={isUploadingReference}
              >
                <Save className="size-4" />
                {isUploadingReference ? "Saving…" : "Use this recording now"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {existingReferenceAudioUrl ? (
          <div className="mt-5 rounded-xl border bg-background/70 p-4">
            <p className="text-sm font-medium">Students currently hear this</p>
            <audio controls src={existingReferenceAudioUrl} className="mt-3 w-full" />
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border bg-background/70 p-4">
          <p className="text-sm font-medium">Reference video (mouth model)</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Optional. Record a short front-facing clip of your mouth reading the
            passage — or upload one you already have. Students can slow it down
            and zoom in to compare their own mouth movement and position.
          </p>

          {/* Live self-view while recording. */}
          {isRecordingVideo ? (
            <div className="mt-4 overflow-hidden rounded-lg border bg-black">
              <video
                ref={videoPreviewRef}
                muted
                playsInline
                className="aspect-video w-full object-cover"
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={startRecordingReferenceVideo}
              disabled={
                !publishedActivityId || isRecordingVideo || videoUploadPercent !== null
              }
            >
              <CirclePlay className="size-4" />
              Record video
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={stopRecordingReferenceVideo}
              disabled={!isRecordingVideo}
            >
              <Square className="size-4" />
              Stop
            </Button>

            <span className="text-muted-foreground px-1 text-xs">or</span>

            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent ${
                !publishedActivityId || isRecordingVideo || videoUploadPercent !== null
                  ? "pointer-events-none opacity-50"
                  : ""
              }`}
            >
              <FileUp className="size-4" />
              Upload file
              <input
                type="file"
                accept="video/webm,video/mp4"
                className="hidden"
                disabled={
                  !publishedActivityId || isRecordingVideo || videoUploadPercent !== null
                }
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadReferenceVideo(file);
                }}
              />
            </label>
          </div>
          <p className="text-muted-foreground mt-2 text-sm leading-6">{videoSaveStatus}</p>

          {/* Preview a fresh recording, then save it as the reference. */}
          {recordedVideo && !isRecordingVideo ? (
            <div className="mt-4 rounded-lg border bg-background/60 p-3">
              <p className="text-sm font-medium">Your recorded take</p>
              <div className="mt-3 overflow-hidden rounded-lg border bg-black">
                <video
                  controls
                  playsInline
                  src={recordedVideo.url}
                  className="aspect-video w-full object-cover"
                />
              </div>
              <Button
                type="button"
                className="mt-3"
                onClick={() => void uploadReferenceVideo(recordedVideo.blob)}
                disabled={videoUploadPercent !== null}
              >
                <Save className="size-4" />
                {videoUploadPercent !== null
                  ? `Saving… ${videoUploadPercent}%`
                  : "Save as reference video"}
              </Button>
            </div>
          ) : null}

          {existingReferenceVideoUrl ? (
            <div className="mt-4">
              <p className="text-sm font-medium">Current reference video</p>
              <div className="mt-2 overflow-hidden rounded-lg border bg-black">
                <video
                  controls
                  playsInline
                  src={existingReferenceVideoUrl}
                  className="aspect-video w-full object-cover"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          <p className="text-muted-foreground text-sm">{audioSaveStatus}</p>
          <p className="text-sm font-medium">Rehearsal takes</p>
          {takes.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
              No rehearsal take recorded yet.
            </div>
          ) : (
            takes.map((take, index) => {
              const isSelected = take.id === selectedTakeId;
              return (
                <button
                  key={take.id}
                  type="button"
                  onClick={() => setSelectedTakeId(take.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                    isSelected ? "border-primary bg-primary/8" : "hover:bg-muted/60"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">Reference take {takes.length - index}</p>
                    <p className="text-muted-foreground text-sm">
                      {Math.round(take.durationMs / 1000)}s · {Math.round(take.blob.size / 1024)} KB
                    </p>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {new Date(take.createdAt).toLocaleTimeString()}
                  </span>
                </button>
              );
            })
          )}
        </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}