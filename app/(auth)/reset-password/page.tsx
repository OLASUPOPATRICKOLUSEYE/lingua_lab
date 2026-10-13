import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Set a new password — RoutLang",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="w-full max-w-sm">
      <Card>
        <CardHeader className="text-center">
          <span className="bg-primary/12 mx-auto mb-1 flex size-10 items-center justify-center rounded-full">
            <KeyRound className="text-primary size-4.5" />
          </span>
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          <CardDescription>Enter a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}