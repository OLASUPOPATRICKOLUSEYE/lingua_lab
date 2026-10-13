"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { resetPassword, type ResetPasswordState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState(
    resetPassword,
    undefined as ResetPasswordState | undefined,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <input type="hidden" name="token" value={token ?? ""} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state?.fieldErrors?.password)}
        />
        {state?.fieldErrors?.password && (
          <p className="text-destructive text-sm">{state.fieldErrors.password}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state?.fieldErrors?.confirmPassword)}
        />
        {state?.fieldErrors?.confirmPassword && (
          <p className="text-destructive text-sm">
            {state.fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {state?.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      {state?.message && (
        <p className="text-muted-foreground text-sm" role="status">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Saving password…" : "Update password"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Need the email step first?{" "}
        <Link
          href="/forgot-password"
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          Request a reset link
        </Link>
      </p>
    </form>
  );
}
