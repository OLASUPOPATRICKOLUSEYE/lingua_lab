"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    undefined as ForgotPasswordState | undefined,
  );

  // Once the request succeeds, replace the form entirely with a clear
  // "check your email" confirmation — the standard pattern for this flow,
  // rather than leaving the form visible with a line of text under it.
  if (state?.message) {
    return (
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <MailCheck className="text-foreground size-6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-muted-foreground text-sm">
            If an account exists for that address, we&apos;ve sent a link to
            reset your password. It&apos;ll expire in 1 hour.
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <Link
            href="/forgot-password"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            try again
          </Link>
          .
        </p>
        <Link
          href="/login"
          className="text-foreground mt-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">School email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          required
          aria-invalid={Boolean(state?.fieldErrors?.email)}
        />
        {state?.fieldErrors?.email && (
          <p className="text-destructive text-sm">{state.fieldErrors.email}</p>
        )}
      </div>

      {state?.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Preparing reset…" : "Send reset link"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Remembered it?{" "}
        <Link
          href="/login"
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}