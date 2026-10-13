import type { Metadata } from "next";
import { verifySession } from "@/utils/auth/dal";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import {
  ColorSettingsIcon,
  ColorSparklesIcon,
  ColorUserIcon,
} from "@/components/icons/ColorIcons";
import { getSettingsProfileData } from "@/utils/settings/data";

export const metadata: Metadata = {
  title: "Settings — RoutLang",
};

export default async function SettingsPage() {
  const session = await verifySession();
  const profile = await getSettingsProfileData(session);
  const firstName = profile?.fullName?.split(/\s+/)[0] ?? null;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker={`Welcome back${firstName ? `, ${firstName}` : ""} 👋`}
        title="Settings"
        chip={
          <HeaderChip>
            <ColorSparklesIcon className="size-4.5" />
            {profile?.email ?? session.email}
          </HeaderChip>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            icon={<ColorUserIcon className="size-5.5" />}
            title="Profile"
          />
          <p className="text-muted-foreground -mt-3 mb-5 text-sm">
            Your name and preferred language.
          </p>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-background/60 p-4">
              <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                Account email
              </p>
              <p className="pt-2 text-sm font-medium break-all">
                {profile?.email ?? session.email}
              </p>
            </div>
            <div className="rounded-xl border bg-background/60 p-4">
              <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                Learning language
              </p>
              <p className="pt-2 text-sm font-medium">
                {profile?.languagePref ?? "Not set yet"}
              </p>
            </div>
          </div>
          <ProfileForm
            defaultFullName={profile?.fullName}
            defaultPreferredLanguage={profile?.languagePref}
          />
        </Panel>

        <Panel>
          <PanelHeader
            icon={<ColorSettingsIcon className="size-5.5" />}
            title="Learning settings"
          />
          <p className="text-muted-foreground -mt-3 mb-5 text-sm">
            School-managed preferences will appear here when the backing user
            settings fields are available.
          </p>
          <div className="grid gap-3">
            <div className="rounded-xl border bg-background/60 p-4">
              <p className="text-sm font-medium">School-managed settings</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                Class-specific pacing, school policies, and teacher-controlled
                defaults will appear here once the backing user-settings fields
                are added.
              </p>
            </div>
            <div className="rounded-lg border border-dashed px-4 py-5 text-sm">
              <p className="font-medium">No editable learning settings yet</p>
              <p className="text-muted-foreground mt-2 leading-6">
                The old timezone and weekly-goal form has been removed because
                those values are not persisted in the current schema.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
