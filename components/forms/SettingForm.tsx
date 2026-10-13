"use client";

import { useActionState } from "react";
import { updateSettings, type SettingState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingForm() {
  const [state, action] = useActionState<SettingState | undefined, FormData>(
    updateSettings,
    undefined,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          id="timezone"
          name="timezone"
          placeholder="Africa/Lagos"
          required
          aria-invalid={Boolean(state?.fieldErrors?.timezone)}
        />
        {state?.fieldErrors?.timezone && (
          <p className="text-destructive text-sm">{state.fieldErrors.timezone}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="weeklyGoalMinutes">Weekly speaking goal (minutes)</Label>
        <Input
          id="weeklyGoalMinutes"
          name="weeklyGoalMinutes"
          type="number"
          min={15}
          max={600}
          step={15}
          placeholder="90"
          required
          aria-invalid={Boolean(state?.fieldErrors?.weeklyGoalMinutes)}
        />
        {state?.fieldErrors?.weeklyGoalMinutes && (
          <p className="text-destructive text-sm">
            {state.fieldErrors.weeklyGoalMinutes}
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

      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
        Preview only — timezone and weekly goal aren’t saved yet. Saving is
        enabled once the profile schema adds these fields.
      </p>

      <Button
        type="submit"
        disabled
        aria-disabled
        title="Saving these settings isn’t available yet"
        className="mt-2 w-full sm:w-auto"
      >
        Save settings
      </Button>
    </form>
  );
}
