import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/modules/auth/infrastructure/session";
import { AuthCard } from "@/modules/auth/ui/auth-card";
import { LoginForm } from "@/modules/auth/ui/login-form";

export const metadata: Metadata = { title: "Sign in · Gymple" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <AuthCard
        title="Sign in to track your training"
        footer={
          <>
            New to Gymple?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        }
      >
        <LoginForm />
      </AuthCard>
    </main>
  );
}

async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}
