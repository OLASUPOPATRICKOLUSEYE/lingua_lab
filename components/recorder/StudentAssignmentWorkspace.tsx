"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Loader2 } from "lucide-react";
import { AudioRecorder } from "@/components/recorder/AudioRecorder";
import { DualTrackPlayer } from "@/components/recorder/DualTrackPlayer";
import { TeacherReadAlong } from "@/components/recorder/TeacherReadAlong";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhonemeFeedback } from "@/components/feedback/PhonemeFeedback";
import {
  uploadTakeInChunks,
  type RecorderTake,
  type UploadProgress,
  type UploadTakeResult,
} from "@/components/recorder/recorder-utils";
import {
  formatSubmittedAt,
  scoreColorClass,
  statusMeta,
} from "@/utils/presentation/submission";
import type { StudentAssignment } from "@/utils/student/assignments";
import type { PhonemeScore } from "@lingua/db";

interface StudentAssignmentWorkspaceProps {
  assignment: StudentAssignment;
}

interface StudentSubmissionSnapshot {
  id: string;
  status: string;
  submittedAt: string;
  processedMediaUrl: string | null;
  rawMediaUrl: string;
  latestGrade: {
    transcript: string | null;
    wer: number | null;
    wpm: number | null;
    fluencyScore: number | null;
    pronunciationScore: number | null;
    cefrEstimate: string | null;
    phonemeScores: PhonemeScore[] | null;
    overrideJustification: string | null;
    gradedAt: string;
  } | null;
}

function resultStateCopy(status: string | null): {
  title: string;
  body: string;
  badgeVariant: "secondary" | "warning" | "success" | "destructive";
} {
  if (status === "graded") {
    return {
      title: "Your result is ready",
      body: "The system has finished scoring this take. Review the result and decide if you want to try again.",
      badgeVariant: "success",
    };
  }
  if (status === "pending_review") {
    return {
      title: "Waiting for teacher review",
      body: "Your take is saved and queued for teacher review. You do not need to upload it again.",
      badgeVariant: "warning",
    };
  }
  if (status === "processing") {
    return {
      title: "Scoring in progress",
      body: "Your take is uploaded and being graded now. Stay here a moment or come back later.",
      badgeVariant: "warning",
    };
  }
  if (status === "failed") {
    return {
      title: "Something interrupted scoring",
      body: "Your take was uploaded, but the grading step did not complete cleanly.",
      badgeVariant: "destructive",
    };
  }
  return {
    title: "Upload received",
    body: "Your take is saved. The next step depends on the current grading mode for your school.",
    badgeVariant: "secondary",
  };
}

export function StudentAssignmentWorkspace({
  assignment,
}: StudentAssignmentWorkspaceProps) {
  const [selectedTake, setSelectedTake] = useState<RecorderTake | null>(null);
  const [step, setStep] = useState<"start" | "record" | "compare">("start");
  const [uploadedSubmissionId, setUploadedSubmissionId] = useState<string | null>(null);
  const [submissionSnapshot, setSubmissionSnapshot] = useState<StudentSubmissionSnapshot | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const isSendingRef = useRef(false);
  const [sendProgress, setSendProgress] = useState<UploadProgress>({
    phase: "idle",
    percent: 0,
    message: "Your take is ready. Listen back once, then send it when you are happy.",
  });
  const isSending =
    sendProgress.phase === "compressing" || sendProgress.phase === "uploading";
  const steps = ["start", "record", "compare"] as const;
  const labels: Record<(typeof steps)[number], { title: string; hint: string }> = {
    start: {
      title: "Get ready",
      hint: "Read and hear the model once.",
    },
    record: {
      title: "Record",
      hint: "Make one clear take.",
    },
    compare: {
      title: "Review",
      hint: "Check how it sounds.",
    },
  };

  const currentStepIndex = steps.indexOf(step);
  const resultState = resultStateCopy(submissionStatus);
  const latestGrade = submissionSnapshot?.latestGrade ?? null;
  const shouldShowHeardTranscript = Boolean(
    latestGrade?.transcript && !latestGrade.overrideJustification,
  );

  useEffect(() => {
    if (!uploadedSubmissionId) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    async function pollSubmission() {
      try {
        const response = await fetch(`/api/submissions/${uploadedSubmissionId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as {
          submission?: StudentSubmissionSnapshot;
        };
        if (cancelled || !body.submission) {
          return;
        }

        setSubmissionSnapshot(body.submission);
        setSubmissionStatus(body.submission.status);

        if (body.submission.status === "processing" || body.submission.status === "pending") {
          timer = window.setTimeout(pollSubmission, 2500);
          return;
        }
      } catch {
        timer = window.setTimeout(pollSubmission, 3500);
        return;
      }
    }

    void pollSubmission();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [uploadedSubmissionId]);

  function goToNextStep() {
    if (currentStepIndex === steps.length - 1) return;
    const nextStep = steps[currentStepIndex + 1];
    if (nextStep === "compare" && !selectedTake) return;
    setStep(nextStep);
  }

  function handleUploadComplete(result: UploadTakeResult) {
    setUploadedSubmissionId(result.submissionId);
    setSubmissionStatus(result.status);
    setSendProgress({
      phase: "success",
      percent: 100,
      message: result.manualReview
        ? "Sent — waiting for teacher review."
        : "Sent — grading is running now.",
    });
  }

  async function submitTake() {
    if (!selectedTake || isSendingRef.current) return;
    isSendingRef.current = true;
    try {
      // Never compress on the click. AudioRecorder starts compression in the
      // background as soon as a take exists; if it has not finished (or this is
      // video, which is never compressed), send the original. compressAudioBlob
      // re-encodes in REAL TIME, so awaiting it here froze the Send button for
      // the full length of the recording.
      const takeBlob = selectedTake.compressedBlob ?? selectedTake.blob;

      const result = await uploadTakeInChunks({
        endpoint: "/api/submissions/upload",
        activityId: assignment.activity.id,
        take: selectedTake,
        compressedBlob: takeBlob,
        onProgress: setSendProgress,
      });
      handleUploadComplete(result);
    } catch (err) {
      setSendProgress({
        phase: "error",
        percent: 0,
        message: (err as Error).message,
      });
    } finally {
      isSendingRef.current = false;
    }
  }

  return (
    <section className="space-y-10">
      <ol className="flex items-center gap-3 text-sm">
        {steps.map((item, index) => {
          const active = item === step;
          const done = index < currentStepIndex || (item === "compare" && step === "compare");
          const disabled = item === "compare" && !selectedTake;

          return (
            <li key={item} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => !disabled && setStep(item)}
                disabled={disabled}
                className="group flex items-center gap-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold transition ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "border-primary text-primary border"
                        : "text-muted-foreground border"
                  }`}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={
                    active
                      ? "font-medium"
                      : "text-muted-foreground group-hover:text-foreground transition-colors"
                  }
                >
                  {labels[item].title}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <span className="bg-border h-px w-6" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>

      {step === "start" ? (
        <div className="space-y-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Read once, listen once, then speak
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-[15px] leading-7">
              Read the passage below, hear your teacher model it, then move to
              recording. {assignment.coachNote}
            </p>
          </div>

          <div className="border-l-2 pl-6">
            <p className="text-foreground text-lg leading-9">
              {assignment.activity.passageText}
            </p>
          </div>

          <TeacherReadAlong
            teacherName={assignment.activity.teacherName}
            language={assignment.activity.targetLanguage}
            passageText={assignment.activity.teacherReferenceText}
            referenceAudioUrl={assignment.activity.teacherReferenceAudioUrl}
          />

          <div className="flex items-center justify-between border-t pt-6">
            <p className="text-muted-foreground text-sm">
              {assignment.activity.timeLimitSeconds}s max ·{" "}
              {assignment.activity.submissionModes.join(" or ")}
            </p>
            <Button type="button" size="lg" onClick={goToNextStep}>
              Start recording
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === "record" ? (
        <div className="space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Record</h2>
              <p className="text-muted-foreground mt-2 max-w-xl text-[15px] leading-7">
                Keep the passage in view and make one strong take. You can try
                again if needed.
              </p>
            </div>
            <Button type="button" variant="ghost" onClick={() => setStep("start")}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </div>

          <AudioRecorder
            activity={assignment.activity}
            selectedTakeId={selectedTake?.id ?? null}
            onSelectedTakeChange={(take) => {
              setSelectedTake(take);
              setUploadedSubmissionId(null);
              setSubmissionSnapshot(null);
              setSubmissionStatus(null);
              setSendProgress({
                phase: "idle",
                percent: 0,
                message: take
                  ? "Your take is ready. Listen back once, then send it when you are happy."
                  : "Record one take to unlock send.",
              });
              if (take) {
                setStep("compare");
              }
            }}
            onUploadComplete={handleUploadComplete}
          />
        </div>
      ) : null}

      {step === "compare" ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Review</h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-[15px] leading-7">
              Listen back once. If it sounds off, go again. If it sounds right,
              send it.
            </p>
          </div>

          <DualTrackPlayer
            selectedTake={selectedTake}
            referenceText={assignment.activity.teacherReferenceText}
            referenceAudioUrl={assignment.activity.teacherReferenceAudioUrl}
            referenceVideoUrl={assignment.activity.teacherReferenceVideoUrl}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
            <Button type="button" variant="ghost" onClick={() => setStep("record")}>
              <ArrowLeft className="size-4" />
              Try again
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={() => void submitTake()}
              disabled={!selectedTake || isSending || uploadedSubmissionId !== null}
            >
              {isSending ? <Loader2 className="size-4 animate-spin" /> : null}
              {uploadedSubmissionId ? "Sent" : "Send this take"}
            </Button>
          </div>

          {sendProgress.phase !== "idle" || sendProgress.message ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground leading-6">
                {sendProgress.message}
              </p>
              {(isSending || sendProgress.phase === "success") && sendProgress.percent > 0 ? (
                <Badge variant={sendProgress.phase === "success" ? "success" : "secondary"}>
                  {Math.round(sendProgress.percent)}%
                </Badge>
              ) : null}
            </div>
          ) : null}

          {uploadedSubmissionId ? (
            <div className="space-y-8 border-t pt-8">
              {/* status line */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {resultState.title}
                  </h3>
                  <Badge variant={resultState.badgeVariant}>
                    {submissionStatus ? statusMeta(submissionStatus).label : "Uploaded"}
                  </Badge>
                </div>
                {submissionSnapshot ? (
                  <span className="text-muted-foreground text-sm">
                    Submitted {formatSubmittedAt(new Date(submissionSnapshot.submittedAt))}
                  </span>
                ) : null}
              </div>

              {submissionStatus === "processing" || submissionStatus === "pending" ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="text-primary size-4 animate-spin" />
                  Scoring your take — your feedback will appear here automatically.
                </div>
              ) : (
                <p className="text-muted-foreground text-sm leading-6">
                  {resultState.body}
                </p>
              )}

              {latestGrade ? (
                <>
                  {/* Guidance first: the sounds to work on. */}
                  <div>
                    <p className="text-muted-foreground text-xs tracking-wide uppercase">
                      Sounds to work on
                    </p>
                    <div className="mt-3">
                      {latestGrade.phonemeScores &&
                      latestGrade.phonemeScores.length > 0 ? (
                        <PhonemeFeedback scores={latestGrade.phonemeScores} />
                      ) : (
                        <p className="text-muted-foreground text-sm leading-6">
                          No sound-by-sound detail on this take. Focus on matching
                          your teacher&apos;s rhythm and clear endings.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Teacher's own note, when they reviewed this take. */}
                  {latestGrade.overrideJustification ? (
                    <div className="border-primary/40 border-l-2 pl-4">
                      <p className="text-muted-foreground text-xs tracking-wide uppercase">
                        Note from your teacher
                      </p>
                      <p className="mt-1.5 text-sm leading-6">
                        {latestGrade.overrideJustification}
                      </p>
                    </div>
                  ) : null}

                  {/* Two headline scores + level. */}
                  <div className="flex flex-wrap gap-x-12 gap-y-6">
                    <div>
                      <p className="text-muted-foreground text-xs tracking-wide uppercase">
                        Pronunciation
                      </p>
                      <p
                        className={`mt-1 text-3xl font-semibold tabular-nums ${scoreColorClass(latestGrade.pronunciationScore)}`}
                      >
                        {latestGrade.pronunciationScore ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs tracking-wide uppercase">
                        Fluency
                      </p>
                      <p
                        className={`mt-1 text-3xl font-semibold tabular-nums ${scoreColorClass(latestGrade.fluencyScore)}`}
                      >
                        {latestGrade.fluencyScore ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span>
                      Level{" "}
                      <span className="text-foreground font-medium">
                        {latestGrade.cefrEstimate ?? "—"}
                      </span>
                    </span>
                    <span>
                      Pace{" "}
                      <span className="text-foreground font-medium">
                        {latestGrade.wpm ?? "—"} wpm
                      </span>
                    </span>
                    <span>
                      Words matched{" "}
                      <span className="text-foreground font-medium">
                        {latestGrade.wer != null
                          ? `${Math.round((1 - Math.min(latestGrade.wer, 1)) * 100)}%`
                          : "—"}
                      </span>
                    </span>
                  </div>

                  {shouldShowHeardTranscript ? (
                    <details>
                      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm transition-colors">
                        What we heard
                      </summary>
                      <p className="text-muted-foreground mt-2 text-sm leading-6">
                        {latestGrade?.transcript}
                      </p>
                    </details>
                  ) : null}
                </>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
                <p className="text-muted-foreground text-sm">
                  {submissionStatus === "graded"
                    ? "Practice the flagged sounds, then record a stronger take."
                    : "You can keep this take or record a fresh one."}
                </p>
                <Button type="button" variant="outline" onClick={() => setStep("record")}>
                  Try another take
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
