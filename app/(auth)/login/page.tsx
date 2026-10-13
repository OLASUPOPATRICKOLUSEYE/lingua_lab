import type { Metadata } from "next";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { SignInForm } from "@/components/forms/SignInForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in — RoutLang",
};

export default function LoginPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <span className="bg-primary/12 mx-auto mb-1 flex size-10 items-center justify-center rounded-full">
            <LogIn className="text-primary size-4.5" />
          </span>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Use your school email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        Forgot your password?{" "}
        <Link
          href="/forgot-password"
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          Reset it
        </Link>
      </p>
    </div>
  );
}
