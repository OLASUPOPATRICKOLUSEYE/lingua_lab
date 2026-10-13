import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import {
  ColorClipboardIcon,
  ColorMicIcon,
  ColorQueueIcon,
  ColorSparklesIcon,
} from "@/components/icons/ColorIcons";
import { PhonemeFeedback } from "@/components/feedback/PhonemeFeedback";
import { MouthComparison } from "@/components/recorder/MouthComparison";
import { TeacherPlaybackReview } from "@/components/teacher/TeacherPlaybackReview";
import { TeacherReviewClient } from "@/components/teacher/TeacherReviewClient";
import { requireRole } from "@/utils/auth/dal";
import {
  getTeacherReviewQueueContext,
  getTeacherSubmissionReview,
} from "@/utils/teacher-review/data";
import {
  StatusBadge,
  formatSubmittedAt,
  resolveSubmissionMediaType,
  scoreColorClass,
} from "@/utils/presentation/submission";

interface TeacherSubmissionReviewPageProps {
  params: Promise<{
    submissionId: string;
  }>;
  searchParams?: Promise<{
    class?: string;
    activityId?: string;
    view?: string;
  }>;
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

function toCefrLevel(
  value: string | null,
): "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null {
  if (value && CEFR_LEVELS.includes(value as (typeof CEFR_LEVELS)[number])) {
    return value as "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  }
  return null;
}

export default async function TeacherSubmissionReviewPage({
  params,
  searchParams,
}: TeacherSubmissionReviewPageProps) {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { submissionId } = await params;
  const resolvedSearchParams = await searchParams;
  const classSlug = resolvedSearchParams?.class?.trim() || null;
  const activityId = resolvedSearchParams?.activityId?.trim() || null;
  const view = resolvedSearchParams?.view === "graded" ? "graded" : "waiting";
  const review = await getTeacherSubmissionReview(session, submissionId);

  if (!review) {
    notFound();
  }

  const queueContext = await getTeacherReviewQueueContext(session, submissionId, {
    classSlug,
    activityId,
    view,
  });
  const queueQuery = {
    ...(queueContext.classSlug ? { class: queueContext.classSlug } : {}),
    ...(queueContext.activityId ? { activityId: queueContext.activityId } : {}),
    view,
  };
  const hasQueueContext =
    Boolean(queueContext.classSlug) || Boolean(queueContext.activityId);

  const regradeState = !review.processedPath
    ? "missing_processed_audio"
    : !process.env.AI_SERVICE_URL
      ? "ai_disabled"
      : "available";
  const isVideoSubmission =
    resolveSubmissionMediaType(review.mediaType, review.rawStoragePath) === "video";
  // Normalization rewrites every take to a 16 kHz mono .wav for the AI
  // pipeline — that file has no video track. So a video submission must play
  // back from the RAW upload, or the teacher gets sound with no picture.
  const preferredMediaKind =
    isVideoSubmission || !review.processedPath ? "raw" : "processed";

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Teacher review"
        title={review.studentName}
        chip={
          <HeaderChip>
            <ColorSparklesIcon className="size-4.5" />
            Submission detail
          </HeaderChip>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link
                href={{
                  pathname: "/teacher",
                  query: queueQuery,
                }}
              >
                <ArrowLeft className="size-4" />
                Back to queue
              </Link>
            </Button>
            {review.className ? (
              <Badge variant="outline">
                {review.className}
              </Badge>
            ) : null}
            {review.activityTitle ? (
              <Badge variant="outline">
                {review.activityTitle}
              </Badge>
            ) : null}
            <StatusBadge status={review.status} />
            <Badge variant="outline">
              {formatSubmittedAt(review.submittedAt)}
            </Badge>
          </div>
        }
      />

      {(queueContext.previousSubmission || queueContext.nextSubmission || hasQueueContext) ? (
        <Panel>
          <PanelHeader
            icon={<ColorQueueIcon className="size-5.5" />}
            title="Queue continuity"
            badge={hasQueueContext ? "Filtered review" : "Open review queue"}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {queueContext.className ? (
                <Badge variant="outline">{queueContext.className}</Badge>
              ) : null}
              {queueContext.activityTitle ? (
                <Badge variant="outline">{queueContext.activityTitle}</Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {queueContext.previousSubmission ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={{
                      pathname: `/teacher/submissions/${queueContext.previousSubmission.id}`,
                      query: queueQuery,
                    }}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Link>
                </Button>
              ) : null}
              {queueContext.nextSubmission ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={{
                      pathname: `/teacher/submissions/${queueContext.nextSubmission.id}`,
                      query: queueQuery,
                    }}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Fluency"
          value={review.latestFluencyScore ?? "—"}
          valueClassName={scoreColorClass(review.latestFluencyScore)}
          hint="Latest result"
        />
        <StatTile
          label="Pronunciation"
          value={review.latestPronunciationScore ?? "—"}
          valueClassName={scoreColorClass(review.latestPronunciationScore)}
          hint="Latest result"
        />
        <StatTile
          label="Word Error Rate"
          value={review.latestWer === null ? "—" : `${Math.round(review.latestWer * 100)}%`}
          hint="Latest transcript alignment"
        />
        <StatTile
          label="CEFR"
          value={review.latestCefrEstimate ?? "—"}
          hint={review.latestReviewedBy ? "Teacher-reviewed result exists" : "No manual override yet"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <PanelHeader
            icon={<ColorMicIcon className="size-5.5" />}
            title="Playback"
            badge={
              isVideoSubmission
                ? "Original video"
                : preferredMediaKind === "processed"
                  ? "Processed audio"
                  : "Raw fallback"
            }
          />
          {isVideoSubmission ? (
            <div className="mb-4 rounded-xl border bg-muted/40 p-3.5">
              <MouthComparison
                studentSrc={`/api/submissions/${review.id}/media?kind=raw`}
                referenceVideoUrl={
                  review.referenceVideoPath
                    ? `/api/activities/${review.activityId}/reference-media?kind=video`
                    : null
                }
                studentLabel="Student take"
              />
            </div>
          ) : null}
          <TeacherPlaybackReview
            mediaSrc={`/api/submissions/${review.id}/media?kind=${preferredMediaKind}`}
            isVideo={isVideoSubmission}
            transcript={review.latestTranscript}
            wordTimestamps={review.gradingHistory[0]?.wordTimestamps ?? null}
          />
        </Panel>

        <Panel>
          <PanelHeader
            icon={<ColorQueueIcon className="size-5.5" />}
            title="Latest result"
            badge={review.gradingHistory.length > 0 ? review.gradingHistory[0]?.modelVersion : "No grade yet"}
          />
          <div className="space-y-4 text-sm">
            <div className="grid gap-3">
              <div className="border-border bg-muted/50 rounded-lg border p-4">
                <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">CEFR estimate</p>
                <p className="text-foreground pt-1 text-2xl font-semibold">
                  {review.latestCefrEstimate ?? "—"}
                </p>
              </div>
              <div className="border-border bg-muted/50 rounded-lg border p-4">
                <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
                  Sounds to work on
                </p>
                <div className="pt-2.5">
                  {review.latestPhonemeScores &&
                  review.latestPhonemeScores.length > 0 ? (
                    <PhonemeFeedback scores={review.latestPhonemeScores} />
                  ) : (
                    <p className="text-muted-foreground leading-6">
                      No phoneme detail on this grade yet.
                    </p>
                  )}
                </div>
              </div>
              <div className="border-border bg-muted/50 rounded-lg border p-4">
                <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">Latest justification</p>
                <p className="text-muted-foreground pt-2 leading-6">
                  {review.latestOverrideJustification ?? "No manual override yet"}
                </p>
              </div>
              <div className="border-border bg-muted/50 rounded-lg border p-4">
                <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">Submission state</p>
                <p className="text-foreground pt-1 text-base font-medium">
                  {review.processedPath
                    ? "Processed audio available"
                    : "Raw upload only right now"}
                </p>
                <p className="text-muted-foreground pt-2 leading-6">
                  {review.processedPath
                    ? "Re-grade can use the normalized processed file."
                    : "This take can still be reviewed manually, but re-grade waits for processed audio."}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <PanelHeader
            icon={<Sparkles className="text-primary size-4.5" />}
            title="Teacher override"
          />
          <TeacherReviewClient
            submissionId={review.id}
            regradeState={regradeState}
            initialFluencyScore={review.latestFluencyScore}
            initialPronunciationScore={review.latestPronunciationScore}
            initialCefrEstimate={toCefrLevel(review.latestCefrEstimate)}
          />
        </Panel>

        <Panel>
          <PanelHeader
            icon={<ColorClipboardIcon className="size-5.5" />}
            title="Grading history"
            badge={`${review.gradingHistory.length} entries`}
          />
          <div className="space-y-4">
            {review.gradingHistory.length > 0 ? (
              review.gradingHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="border-border bg-muted/50 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-foreground font-medium">{entry.modelVersion}</p>
                    <Badge variant="outline">
                      {formatSubmittedAt(entry.gradedAt)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground pt-2 text-sm">
                    Fluency {entry.fluencyScore ?? "—"} · Pronunciation{" "}
                    {entry.pronunciationScore ?? "—"} · WER{" "}
                    {entry.wer === null ? "—" : `${Math.round(entry.wer * 100)}%`} · CEFR{" "}
                    {entry.cefrEstimate ?? "—"}
                  </p>
                  {entry.wordTimestamps?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.wordTimestamps.slice(0, 10).map((token, index) => (
                        <div
                          key={`${entry.id}-${token.word}-${token.start_ms}-${index}`}
                          className="border-border bg-background rounded-lg border px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium">{token.word}</span>
                          <span className="text-muted-foreground pl-2">
                            {(token.start_ms / 1000).toFixed(2)}s
                          </span>
                        </div>
                      ))}
                      {entry.wordTimestamps.length > 10 ? (
                        <div className="text-muted-foreground rounded-lg border px-2.5 py-1 text-xs">
                          +{entry.wordTimestamps.length - 10} more
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {entry.overrideJustification ? (
                    <p className="text-foreground/80 mt-3 text-sm leading-6">
                      {entry.overrideJustification}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No grading history yet.</p>
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}
