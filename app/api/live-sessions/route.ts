import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { classes, liveSessions, withClaims } from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";
import {
  LIVE_SESSION_PROVIDERS,
  isValidJoinUrl,
  joinUrlError,
} from "@/utils/live-sessions/providers";

export const dynamic = "force-dynamic";

const dbUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "must be a UUID",
  );

const payloadSchema = z
  .object({
    classId: dbUuid,
    provider: z.enum(LIVE_SESSION_PROVIDERS),
    // Optional at the field level because an in-person class has no meeting
    // link. The refinement below still REQUIRES it for every remote provider,
    // so this is not a loosening of the allowlist.
    joinUrl: z.string().trim().max(2048).optional().nullable(),
    title: z.string().trim().max(120).optional().nullable(),
    startsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(240),
  })
  // The host allowlist is the security boundary — see providers.ts. Enforced
  // here rather than in the UI, because the UI is not a trust boundary.
  .superRefine((value, ctx) => {
    if (value.provider === "in_person") {
      // The DB check constraint requires join_url IS NULL for in_person, so a
      // stray URL must be rejected here rather than surfacing as a 500 from
      // live_sessions_join_url_check.
      if (value.joinUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["joinUrl"],
          message: "An in-person class cannot have a meeting link.",
        });
      }
      return;
    }

    if (!value.joinUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["joinUrl"],
        message: joinUrlError(value.provider),
      });
      return;
    }

    if (!isValidJoinUrl(value.provider, value.joinUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["joinUrl"],
        message: joinUrlError(value.provider),
      });
    }
  });

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const { classId, provider, joinUrl, title, startsAt, durationMinutes } =
    parsed.data;

  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const created = await withClaims(toAuthClaims(session), async (tx) => {
    // A teacher may only schedule for a class they own; admins may schedule
    // for any class in their school (RLS already bounds that to the tenant).
    const [classroom] = await tx
      .select({ id: classes.id })
      .from(classes)
      .where(
        session.role === "teacher"
          ? and(eq(classes.id, classId), eq(classes.teacherId, session.id))
          : eq(classes.id, classId),
      )
      .limit(1);

    if (!classroom) {
      return { type: "class_missing" as const };
    }

    const id = randomUUID();
    await tx.insert(liveSessions).values({
      id,
      schoolId: session.schoolId,
      classId,
      provider,
      // NULL for in_person: live_sessions_join_url_check enforces
      // (provider = 'in_person' AND join_url IS NULL).
      joinUrl: provider === "in_person" ? null : (joinUrl ?? null),
      title: title || null,
      startsAt: start,
      endsAt: end,
    });

    return { type: "ok" as const, id };
  });

  if (created.type === "class_missing") {
    return NextResponse.json(
      { error: "Class was not found, or you do not manage it." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      liveSession: {
        id: created.id,
        classId,
        provider,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      },
    },
    { status: 201 },
  );
}
