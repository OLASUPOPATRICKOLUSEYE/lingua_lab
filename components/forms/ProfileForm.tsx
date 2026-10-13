"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateProfile, type ProfileState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProfileFormProps {
  defaultFullName?: string;
  defaultPreferredLanguage?: string;
}

export function ProfileForm({
  defaultFullName,
  defaultPreferredLanguage,
}: ProfileFormProps) {
  const [state, action, pending] = useActionState<ProfileState | undefined, FormData>(
    updateProfile,
    undefined,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder="Amina Okafor"
          defaultValue={defaultFullName}
          required
          aria-invalid={Boolean(state?.fieldErrors?.fullName)}
        />
        {state?.fieldErrors?.fullName && (
          <p className="text-destructive text-sm">{state.fieldErrors.fullName}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="preferredLanguage">Preferred learning language</Label>
        <Input
          id="preferredLanguage"
          name="preferredLanguage"
          placeholder="en"
          defaultValue={defaultPreferredLanguage}
          required
          aria-invalid={Boolean(state?.fieldErrors?.preferredLanguage)}
        />
        {state?.fieldErrors?.preferredLanguage && (
          <p className="text-destructive text-sm">
            {state.fieldErrors.preferredLanguage}
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

      <Button type="submit" disabled={pending} className="mt-2 w-full sm:w-auto">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Saving profile…" : "Save profile"}
      </Button>
    </form>
  );
}
