import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { activities, users, withClaims } from "@lingua/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { findLanguage } from "@/utils/languages";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  passageTitle: z.string().trim().min(3),
  // Validated against the shared registry rather than a two-value enum, so
  // adding a language never means editing a route handler again.
  targetLanguage: z.string().trim().refine((v) => findLanguage(v) !== null, {
    message: "Unsupported target language.",
  }),
  passageText: z.string().trim().min(20),
  coachNote: z.string().trim().min(3).max(500).optional().default(""),
});

function buildPrompt(targetLanguage: string): string {
  // Previously a French/English ternary, which silently produced French copy for
  // every other language.
  const name = findLanguage(targetLanguage)?.name ?? targetLanguage;
  return `Read the full passage in ${name}. Use the teacher model for rhythm, stress, pauses, and clarity.`;
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const activity = await withClaims(toAuthClaims(session), async (tx) => {
    const [teacher] = await tx
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const id = randomUUID();
    await tx.insert(activities).values({
      id,
      schoolId: session.schoolId,
      teacherId: session.id,
      title: parsed.data.passageTitle,
      prompt: buildPrompt(parsed.data.targetLanguage),
      targetLanguage: parsed.data.targetLanguage,
      passageText: parsed.data.passageText,
      teacherName: teacher?.fullName ?? session.email,
      teacherReferenceText: parsed.data.passageText,
      coachNote: parsed.data.coachNote || null,
      submissionModes: ["audio", "video"],
      timeLimitSeconds: 90,
    });

    return {
      id,
      title: parsed.data.passageTitle,
    };
  });

  return NextResponse.json({ ok: true, activity }, { status: 201 });
}
