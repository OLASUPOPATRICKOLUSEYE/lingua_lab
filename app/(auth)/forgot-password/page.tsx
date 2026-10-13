import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Forgot password — RoutLang",
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      <Card>
        <CardHeader className="text-center">
          <span className="bg-primary/12 mx-auto mb-1 flex size-10 items-center justify-center rounded-full">
            <Mail className="text-primary size-4.5" />
          </span>
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>Enter your school email to start the reset flow.</CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
