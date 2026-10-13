/**
 * Seed local Postgres with one school, the 4 RBAC test users, and sample
 * submissions/grading_results so the dashboards show real data.
 *
 * IDs come from env so they MATCH the Supabase Auth user ids (login + RLS need
 * the local row id and school_id to equal the Supabase user's id and
 * app_metadata.school_id). Paste your Supabase ids into .env, then re-run:
 *
 *   SEED_ADMIN_ID=...        (defaults to the existing test@gmail.com id)
 *   SEED_DEPT_HEAD_ID=...
 *   SEED_TEACHER_ID=...
 *   SEED_STUDENT_ID=...      ← most important: the student dashboard is
 *                              self-scoped to this id, and sample submissions
 *                              are attached to it automatically.
 *
 * Any id left unset falls back to a fixed placeholder. The script is
 * idempotent AND self-healing: it re-points sample submissions/grades to the
 * CURRENT student id and removes rows from prior runs that used a different id,
 * so you never have to hand-patch ids.
 *
 * Run: pnpm db:seed   (or pnpm --filter @lingua/db tsx src/scripts/seed-test-users.ts)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";

// Snapshot SEED_* ids from the SHELL environment BEFORE any .env loader runs.
// tsx and dotenv auto-load .env and can override these with an empty string,
// which would silently ignore an id you passed on the command line. Capturing
// here makes a shell-exported id always win over a blank .env entry.
const SHELL_SEED_IDS: Record<string, string | undefined> = {
  SEED_ADMIN_ID: process.env.SEED_ADMIN_ID,
  SEED_DEPT_HEAD_ID: process.env.SEED_DEPT_HEAD_ID,
  SEED_TEACHER_ID: process.env.SEED_TEACHER_ID,
  SEED_STUDENT_ID: process.env.SEED_STUDENT_ID,
};

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_ADMIN_URL / DATABASE_URL must be set.");

const SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
const ACTIVITY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTIVITY_ID_EN = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CLASS_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ASSIGNMENT_ID_FR = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ASSIGNMENT_ID_EN = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an id: a shell-exported value wins; otherwise the .env value; else
 * the placeholder fallback. Validates UUID format when a value is present.
 */
function idFromEnv(envKey: string, fallback: string): string {
  const v = (SHELL_SEED_IDS[envKey] ?? process.env[envKey])?.trim();
  if (!v) return fallback;
  if (!UUID_RE.test(v)) {
    throw new Error(`${envKey}="${v}" is not a valid UUID.`);
  }
  return v;
}

const USERS = [
  { id: idFromEnv("SEED_ADMIN_ID", "92d46e22-4ad1-4dc9-a1df-7de51787d454"), role: "system_admin", fullName: "Test Admin", email: "test@gmail.com" },
  { id: idFromEnv("SEED_DEPT_HEAD_ID", "22222222-2222-2222-2222-222222222222"), role: "dept_head", fullName: "Test Dept Head", email: "depthead@example.com" },
  { id: idFromEnv("SEED_TEACHER_ID", "33333333-3333-3333-3333-333333333333"), role: "teacher", fullName: "Test Teacher", email: "teacher@example.com" },
  { id: idFromEnv("SEED_STUDENT_ID", "44444444-4444-4444-4444-444444444444"), role: "student", fullName: "Test Student", email: "student@example.com" },
];
const STUDENT = USERS[3]!;

// Fixed ids for the sample content (stable across runs; only the student_id
// they point to varies).
const SUBS = [
  { id: "55555555-5555-5555-5555-555555555555", status: "graded" },
  { id: "66666666-6666-6666-6666-666666666666", status: "graded" },
  { id: "77777777-7777-7777-7777-777777777777", status: "pending" },
];
const GRADES = [
  { id: "88888888-8888-8888-8888-888888888888", subId: SUBS[0]!.id, fluency: 82, pron: 78, cefr: "B1" },
  { id: "99999999-9999-9999-9999-999999999999", subId: SUBS[1]!.id, fluency: 88, pron: 84, cefr: "B2" },
];

async function main() {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    await c.query("begin");

    // School.
    await c.query(
      `insert into schools (id, name, slug, plan)
       values ($1, 'Test School', 'test-school', 'standard')
       on conflict (id) do update set name = excluded.name`,
      [SCHOOL_ID],
    );

    // Clear the sample content FIRST (grades, then submissions — FK order) so a
    // user's id can change without violating submissions_student_id_fk. The
    // sample rows are fully recreated below against the resolved student id, so
    // this also self-heals any prior run that used a different id.
    await c.query(`delete from grading_results where id = any($1)`, [GRADES.map((g) => g.id)]);
    await c.query(`delete from submission_processing_states where submission_id = any($1)`, [SUBS.map((s) => s.id)]);
    await c.query(`delete from submissions where id = any($1)`, [SUBS.map((s) => s.id)]);
    await c.query(`delete from activity_assignments where id = any($1)`, [[ASSIGNMENT_ID_FR, ASSIGNMENT_ID_EN]]);
    await c.query(`delete from class_memberships where class_id = $1`, [CLASS_ID]);
    await c.query(`delete from classes where id = $1`, [CLASS_ID]);

    // Users — upsert by email. With dependent submissions cleared above, an id
    // change is now safe. (email is UNIQUE; realign id/role/school on conflict.)
    for (const u of USERS) {
      await c.query(
        `insert into users (id, school_id, role, full_name, email, language_pref)
         values ($1, $2, $3, $4, $5, 'en')
         on conflict (email) do update
           set id = excluded.id, role = excluded.role, full_name = excluded.full_name, school_id = excluded.school_id`,
        [u.id, SCHOOL_ID, u.role, u.fullName, u.email],
      );
    }

    await c.query(
      `insert into activities (
         id,
         school_id,
         teacher_id,
         title,
         prompt,
         target_language,
         passage_text,
         teacher_name,
         teacher_reference_text,
         coach_note,
         submission_modes,
         time_limit_seconds
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       on conflict (id) do update
         set teacher_id = excluded.teacher_id,
             teacher_name = excluded.teacher_name,
             title = excluded.title,
             prompt = excluded.prompt,
             target_language = excluded.target_language,
             passage_text = excluded.passage_text,
             teacher_reference_text = excluded.teacher_reference_text,
             coach_note = excluded.coach_note,
             submission_modes = excluded.submission_modes,
             time_limit_seconds = excluded.time_limit_seconds`,
      [
        ACTIVITY_ID,
        SCHOOL_ID,
        USERS[2]!.id,
        "La gare du matin",
        "Read the full passage in French. Use the teacher model for rhythm and pronunciation.",
        "French",
        "Ce matin, Amina arrive a la gare tres tot. Elle regarde le tableau, trouve son train, puis elle attend calmement sur le quai.",
        USERS[2]!.fullName,
        "Ce matin, Amina arrive a la gare tres tot. Elle regarde le tableau, trouve son train, puis elle attend calmement sur le quai.",
        "Keep the phrases connected and model the endings clearly.",
        JSON.stringify(["audio", "video"]),
        90,
      ],
    );

    // Second seeded passage (English) so the student dashboard shows the
    // two-passage layout out of the box.
    await c.query(
      `insert into activities (
         id,
         school_id,
         teacher_id,
         title,
         prompt,
         target_language,
         passage_text,
         teacher_name,
         teacher_reference_text,
         coach_note,
         submission_modes,
         time_limit_seconds
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       on conflict (id) do update
         set teacher_id = excluded.teacher_id,
             teacher_name = excluded.teacher_name,
             title = excluded.title,
             prompt = excluded.prompt,
             target_language = excluded.target_language,
             passage_text = excluded.passage_text,
             teacher_reference_text = excluded.teacher_reference_text,
             coach_note = excluded.coach_note,
             submission_modes = excluded.submission_modes,
             time_limit_seconds = excluded.time_limit_seconds`,
      [
        ACTIVITY_ID_EN,
        SCHOOL_ID,
        USERS[2]!.id,
        "A rainy afternoon",
        "Read the full passage in English. Use the teacher model for stress, pauses, and clarity.",
        "English",
        "After school, Daniel walked home under a grey sky. The rain started softly, then grew heavier as he crossed the small bridge near his street.",
        USERS[2]!.fullName,
        "After school, Daniel walked home under a grey sky. The rain started softly, then grew heavier as he crossed the small bridge near his street.",
        "Keep your pauses natural and land the sentence endings clearly.",
        JSON.stringify(["audio", "video"]),
        90,
      ],
    );

    await c.query(
      `insert into classes (id, school_id, teacher_id, name, slug)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update
         set teacher_id = excluded.teacher_id,
             name = excluded.name,
             slug = excluded.slug`,
      [CLASS_ID, SCHOOL_ID, USERS[2]!.id, "French 9B", "french-9b"],
    );

    await c.query(
      `insert into class_memberships (class_id, school_id, student_id)
       values ($1, $2, $3)
       on conflict (class_id, student_id) do nothing`,
      [CLASS_ID, SCHOOL_ID, STUDENT.id],
    );

    await c.query(
      `insert into activity_assignments (id, school_id, activity_id, class_id, assigned_by, status)
       values ($1, $2, $3, $4, $5, 'assigned'),
              ($6, $2, $7, $4, $5, 'assigned')
       on conflict (activity_id, class_id) do update
         set assigned_by = excluded.assigned_by,
             status = excluded.status,
             archived_at = null,
             due_at = null`,
      [
        ASSIGNMENT_ID_FR,
        SCHOOL_ID,
        ACTIVITY_ID,
        CLASS_ID,
        USERS[2]!.id,
        ASSIGNMENT_ID_EN,
        ACTIVITY_ID_EN,
      ],
    );

    // (Re)create sample submissions for the resolved student id.
    for (const s of SUBS) {
      await c.query(
        `insert into submissions (id, school_id, student_id, activity_id, raw_storage_path)
         values ($1, $2, $3, $4, $5)`,
        [
          s.id,
          SCHOOL_ID,
          STUDENT.id,
          ACTIVITY_ID,
          `raw/${SCHOOL_ID}/${ACTIVITY_ID}/${STUDENT.id}/${s.id}.webm`,
        ],
      );
      await c.query(
        `insert into submission_processing_states (submission_id, school_id, status, processed_path)
         values ($1, $2, $3, $4)`,
        [
          s.id,
          SCHOOL_ID,
          s.status,
          s.status === "graded"
            ? `processed/${SCHOOL_ID}/${ACTIVITY_ID}/${STUDENT.id}/${s.id}.wav`
            : null,
        ],
      );
    }

    // Grades for the graded submissions.
    for (const g of GRADES) {
      await c.query(
        `insert into grading_results (id, school_id, submission_id, transcript, wpm, wer, fluency_score, pronunciation_score, cefr_estimate, model_version)
         values ($1, $2, $3, 'sample transcript', 120, 0.08, $4, $5, $6, 'whisper-medium-v1')
         on conflict (submission_id, model_version) do nothing`,
        [g.id, SCHOOL_ID, g.subId, g.fluency, g.pron, g.cefr],
      );
    }

    await c.query("commit");

    console.log("✓ Seeded: 1 school, 4 users, 3 submissions, 2 grades (student-scoped data aligned to current ids).\n");
    console.log("User ids in use (must match the Supabase Auth user ids):");
    for (const u of USERS) {
      const src = process.env[`SEED_${u.role.toUpperCase().replace("SYSTEM_ADMIN", "ADMIN")}_ID`] ? "env" : "placeholder";
      console.log(`  • ${u.role.padEnd(13)} ${u.email.padEnd(22)} ${u.id}  (${src})`);
    }
    console.log("\nFor each Supabase Auth user, set app_metadata:");
    console.log(`  {"role":"<role>","school_id":"${SCHOOL_ID}"}`);
    console.log("\nIf any id above is still a placeholder, put the real Supabase id in .env");
    console.log("(SEED_STUDENT_ID etc.) and re-run `pnpm db:seed` — data realigns automatically.");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
