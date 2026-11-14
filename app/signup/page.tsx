import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/modules/auth/infrastructure/session";
import { AuthCard } from "@/modules/auth/ui/auth-card";
import { SignUpForm } from "@/modules/auth/ui/sign-up-form";

export const metadata: Metadata = { title: "Create account · Gymple" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <AuthCard
        title="Create your account"
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <SignUpForm />
      </AuthCard>
    </main>
  );
}

async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}
