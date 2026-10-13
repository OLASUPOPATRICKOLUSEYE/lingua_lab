import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorMicIcon } from "@/components/icons/ColorIcons";
import { requireRole } from "@/utils/auth/dal";
import { getStudentRecordings } from "@/utils/student/recordings";
import {
  StatusBadge,
  formatSubmittedAt,
  resolveSubmissionMediaType,
  scoreColorClass,
} from "@/utils/presentation/submission";

export const dynamic = "force-dynamic";

export default async function StudentRecordingsPage() {
  const session = await requireRole(["student"]);
  const recordings = await getStudentRecordings(session);
  const graded = recordings.filter((r) => r.fluencyScore !== null);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="My recordings"
        title="Every take you have sent"
        chip={
          <HeaderChip>
            <ColorMicIcon className="size-4.5" />
            {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
            {graded.length > 0 ? ` · ${graded.length} graded` : ""}
          </HeaderChip>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/student">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />

      {recordings.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-12 text-center">
            <p className="font-medium">No recordings yet</p>
            <p className="text-muted-foreground text-sm">
              Once you send a take it will appear here with its score.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/student/assignments">Go to practice</Link>
            </Button>
          </div>
        </Panel>
      ) : (
        recordings.map((recording) => {
          const isVideo =
            resolveSubmissionMediaType(recording.mediaType, recording.rawStoragePath) ===
            "video";
          // Always the raw upload: normalization rewrites every take to a 16 kHz
          // mono .wav, which has no video track.
          const mediaSrc = `/api/submissions/${recording.id}/media?kind=raw`;
          const isGraded = recording.fluencyScore !== null;

          return (
            <Panel key={recording.id}>
              <PanelHeader
                icon={<ColorMicIcon className="size-5.5" />}
                title={recording.activityTitle ?? "Practice recording"}
                badge={formatSubmittedAt(recording.submittedAt)}
                action={<StatusBadge status={recording.status} />}
              />

              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  {isVideo ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-96 w-full rounded-xl bg-black"
                      src={mediaSrc}
                    />
                  ) : (
                    <audio controls className="w-full rounded-xl" src={mediaSrc} />
                  )}
                  {recording.targetLanguage ? (
                    <p className="text-muted-foreground pt-2 text-sm">
                      {recording.targetLanguage}
                      {isVideo ? " · video" : " · audio"}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3">
                  {isGraded ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border bg-background/60 p-3">
                          <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                            Fluency
                          </p>
                          <p
                            className={`pt-1 text-2xl font-semibold tabular-nums ${scoreColorClass(
                              recording.fluencyScore,
                            )}`}
                          >
                            {recording.fluencyScore}
                          </p>
                        </div>
                        <div className="rounded-xl border bg-background/60 p-3">
                          <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                            Pronunciation
                          </p>
                          <p
                            className={`pt-1 text-2xl font-semibold tabular-nums ${scoreColorClass(
                              recording.pronunciationScore,
                            )}`}
                          >
                            {recording.pronunciationScore}
                          </p>
                        </div>
                        <div className="rounded-xl border bg-background/60 p-3">
                          <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                            CEFR
                          </p>
                          <p className="pt-1 text-2xl font-semibold">
                            {recording.cefrEstimate ?? "—"}
                          </p>
                        </div>
                      </div>

                      {recording.overrideJustification ? (
                        <div className="rounded-xl border bg-background/60 p-3">
                          <div className="flex items-center gap-2 pb-1">
                            <Badge variant="secondary">Teacher graded</Badge>
                          </div>
                          <p className="text-sm leading-6">
                            {recording.overrideJustification}
                          </p>
                        </div>
                      ) : recording.transcript ? (
                        <div className="rounded-xl border bg-background/60 p-3">
                          <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                            What we heard
                          </p>
                          <p className="pt-1 text-sm leading-6">{recording.transcript}</p>
                        </div>
                      ) : null}

                      {recording.wpm !== null ? (
                        <p className="text-muted-foreground text-sm">
                          {recording.wpm} words per minute
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-6 text-center">
                      <p className="font-medium">
                        {recording.status === "pending_review"
                          ? "Waiting for your teacher"
                          : "No score yet"}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {recording.status === "pending_review"
                          ? "Your teacher will review this take and add a grade."
                          : "You can still listen back to this take."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          );
        })
      )}
    </section>
  );
}
