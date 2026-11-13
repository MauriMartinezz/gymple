import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/modules/auth/infrastructure/session";
import { LoginForm } from "@/modules/auth/ui/login-form";

export const metadata: Metadata = { title: "Sign in · Gymple" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-3xl font-bold tracking-tight text-fg">
            Gym<span className="text-primary">ple</span>
          </p>
          <h1 className="mt-2 text-base text-fg-muted">Sign in to track your training</h1>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-md">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}

async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}
