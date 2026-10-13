import "server-only";

import { users, withClaims } from "@lingua/db";
import { eq } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";

export interface SettingsProfileData {
  fullName: string;
  email: string;
  languagePref: string;
}

export async function getSettingsProfileData(
  session: SessionUser,
): Promise<SettingsProfileData | null> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const [row] = await tx
      .select({
        fullName: users.fullName,
        email: users.email,
        languagePref: users.languagePref,
      })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    return row ?? null;
  });
}
