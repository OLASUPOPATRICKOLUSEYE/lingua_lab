"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login, type LoginState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Email/password sign-in form. Submits to the `login` Server Action via
 * `useActionState` (Next 16 / React 19 pattern) so validation errors render
 * inline without a client-side fetch. On success the action redirects by role.
 */
export function SignInForm() {
  const [state, action, pending] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state?.fieldErrors?.password)}
        />
        {state?.fieldErrors?.password && (
          <p className="text-destructive text-sm">{state.fieldErrors.password}</p>
        )}
      </div>

      {state?.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
