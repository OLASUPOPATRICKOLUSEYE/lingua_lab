import type { Metadata } from "next";
import { Hourglass } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Finish setup — RoutLang",
};

/**
 * Landing for an authenticated user who isn't yet provisioned into a school
 * (no role / school_id in their app_metadata). The full school-provisioning
 * flow is later-phase work; for now this is a holding page so the redirect
 * target in the auth flow resolves to a real route.
 */
export default function OnboardingPage() {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <span className="bg-primary/12 mx-auto mb-1 flex size-10 items-center justify-center rounded-full">
          <Hourglass className="text-primary size-4.5" />
        </span>
        <CardTitle className="text-xl">Almost there</CardTitle>
        <CardDescription>
          You are signed in, but your account has not been assigned to a
          school workspace yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="text-muted-foreground space-y-2 text-left">
          <p>To finish access, ask your school administrator to:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Create or confirm your user record in RoutLang.</li>
            <li>Assign your role: student, teacher, department head, or admin.</li>
            <li>Link your account to the correct school workspace.</li>
          </ol>
        </div>
        <div className="border-border bg-muted/60 rounded-2xl border p-4 text-left">
          <p className="font-medium">After access is assigned</p>
          <p className="text-muted-foreground mt-1">
            Sign out below, then sign in again. Your dashboard will open
            automatically once your role and school access are attached.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-3">
        <form action={logout} className="w-full">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
        <p className="text-muted-foreground text-center text-xs">
          If you are the first person setting up the school, your Supabase
          account metadata still needs a `role` and `school_id`.
        </p>
      </CardFooter>
    </Card>
  );
}
