import type { Metadata } from "next";
import Link from "next/link";
import { MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Accept invite — RoutLang",
};

/**
 * Placeholder route — the invite-acceptance flow is built out in a later phase
 * (out of Weeks 1-2 scope). Nothing links here yet; this renders a graceful
 * "not available" card rather than a blank page for anyone who lands directly
 * (e.g. an early invite link).
 */
export default function AcceptInvitePage() {
  return (
    <div className="w-full max-w-sm">
      <Card>
        <CardHeader className="text-center">
          <span className="bg-primary/12 mx-auto mb-1 flex size-10 items-center justify-center rounded-full">
            <MailX className="text-primary size-4.5" />
          </span>
          <CardTitle className="text-xl">Invites aren’t open yet</CardTitle>
          <CardDescription>
            Accepting invitations will be enabled in a later update. If you already
            have an account, sign in to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
