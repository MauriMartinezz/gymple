import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/modules/auth/ui/auth-card";
import { verifyEmailResult, type VerifyEmailResult } from "@/modules/auth/ui/verify-email-result";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Verify email · Gymple" };

// better-auth's /api/auth/verify-email redirects here with the outcome.
export default function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <AuthCard title="Email verification">
        <Suspense fallback={<p className="text-center text-fg-subtle">Loading…</p>}>
          <Result searchParams={searchParams} />
        </Suspense>
      </AuthCard>
    </main>
  );
}

const CONTENT: Record<VerifyEmailResult, { heading: string; body: string }> = {
  verified: { heading: "Email verified", body: "Your account is ready. Sign in to start training." },
  expired: {
    heading: "This link has expired",
    body: "Sign in with your email and password and we'll send you a new verification link.",
  },
  invalid: {
    heading: "This link is not valid",
    body: "Sign in with your email and password and we'll send you a new verification link.",
  },
  pending: {
    heading: "Check your email",
    body: "Open the verification link we sent you to activate your account.",
  },
};

async function Result({ searchParams }: { searchParams: PageProps<"/verify-email">["searchParams"] }) {
  const result = verifyEmailResult(await searchParams);
  const { heading, body } = CONTENT[result];
  return (
    <div role={result === "expired" || result === "invalid" ? "alert" : "status"} className="flex flex-col gap-3 text-center">
      <h2 className="text-lg font-semibold text-fg">{heading}</h2>
      <p className="text-sm text-fg-muted">{body}</p>
      <Link href="/login" className={buttonClass(result === "verified" ? "primary" : "secondary")}>
        Go to sign in
      </Link>
    </div>
  );
}
