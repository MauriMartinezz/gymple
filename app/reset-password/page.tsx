import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/modules/auth/ui/auth-card";
import { ChoosePasswordForm, RequestPasswordLinkForm } from "@/modules/auth/ui/reset-password-form";
import { resetPasswordView } from "@/modules/auth/ui/reset-password-params";

export const metadata: Metadata = { title: "Choose a password · Gymple" };

// better-auth's /api/auth/reset-password/:token redirects here with `token` or `error`.
export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <AuthCard
        title="Choose a password"
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Suspense fallback={<p className="text-center text-fg-subtle">Loading…</p>}>
          <ResetPassword searchParams={searchParams} />
        </Suspense>
      </AuthCard>
    </main>
  );
}

async function ResetPassword({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const view = resetPasswordView(await searchParams);
  return view.step === "choose" ? (
    <ChoosePasswordForm token={view.token} />
  ) : (
    <RequestPasswordLinkForm linkRejected={view.linkRejected} />
  );
}
