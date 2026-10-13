import { NextResponse } from "next/server";
import { activities, withClaims } from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { findLanguage } from "@/utils/languages";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  passageTitle: z.string().trim().min(3),
  targetLanguage: z.string().trim().refine((v) => findLanguage(v) !== null, {
    message: "Unsupported target language.",
  }),
  passageText: z.string().trim().min(20),
  coachNote: z.string().trim().min(3).max(500).optional().default(""),
});

interface ActivityRouteProps {
  params: Promise<{
    id: string;
  }>;
}

function buildPrompt(targetLanguage: string): string {
  // Previously a French/English ternary, which silently produced French copy for
  // every other language.
  const name = findLanguage(targetLanguage)?.name ?? targetLanguage;
  return `Read the full passage in ${name}. Use the teacher model for rhythm, stress, pauses, and clarity.`;
}

function activityScope(
  session: Awaited<ReturnType<typeof requireRole>>,
  activityId: string,
) {
  if (session.role === "teacher") {
    return and(eq(activities.id, activityId), eq(activities.teacherId, session.id));
  }

  return eq(activities.id, activityId);
}

export async function GET(
  _request: Request,
  { params }: ActivityRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;

  const rows = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        id: activities.id,
        title: activities.title,
        targetLanguage: activities.targetLanguage,
        passageText: activities.passageText,
        coachNote: activities.coachNote,
        teacherReferenceText: activities.teacherReferenceText,
        referenceAudioPath: activities.referenceAudioPath,
      })
      .from(activities)
      .where(activityScope(session, id))
      .limit(1),
  );
  const activity = rows[0];

  if (!activity) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    activity: {
      id: activity.id,
      title: activity.title,
      targetLanguage:
        findLanguage(activity.targetLanguage)?.name ?? activity.targetLanguage,
      passageText: activity.passageText,
      coachNote: activity.coachNote ?? "",
      teacherReferenceText: activity.teacherReferenceText,
      referenceAudioUrl: activity.referenceAudioPath
        ? `/api/activities/${activity.id}/reference-media`
        : null,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: ActivityRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const updated = await withClaims(toAuthClaims(session), async (tx) => {
    const rows = await tx
      .update(activities)
      .set({
        title: parsed.data.passageTitle,
        prompt: buildPrompt(parsed.data.targetLanguage),
        targetLanguage: parsed.data.targetLanguage,
        passageText: parsed.data.passageText,
        teacherReferenceText: parsed.data.passageText,
        coachNote: parsed.data.coachNote || null,
      })
      .where(activityScope(session, id))
      .returning({
        id: activities.id,
        title: activities.title,
      });

    return rows[0] ?? null;
  });

  if (!updated) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, activity: updated });
}
