import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/modules/auth/infrastructure/session";
import { AuthCard } from "@/modules/auth/ui/auth-card";
import { LoginForm } from "@/modules/auth/ui/login-form";
import { safeReturnPath, signUpHref } from "@/modules/auth/ui/return-path";

export const metadata: Metadata = { title: "Sign in · Gymple" };

type Next = Promise<string | null>;

// `?next=` (same-origin paths only) is where to go after signing in.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const next: Next = searchParams.then((params) => safeReturnPath(params.next));
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <RedirectIfSignedIn next={next} />
      </Suspense>
      <AuthCard
        title="Sign in to track your training"
        footer={
          <>
            New to Gymple?{" "}
            <Suspense fallback={<SignUpLink next={null} />}>
              <SignUpLinkFor next={next} />
            </Suspense>
            <GuestLink />
          </>
        }
      >
        <Suspense fallback={<LoginForm />}>
          <LoginFormFor next={next} />
        </Suspense>
      </AuthCard>
    </main>
  );
}

async function RedirectIfSignedIn({ next }: { next: Next }) {
  if (await getCurrentUser()) redirect((await next) ?? "/");
  return null;
}

async function LoginFormFor({ next }: { next: Next }) {
  return <LoginForm next={await next} />;
}

async function SignUpLinkFor({ next }: { next: Next }) {
  return <SignUpLink next={await next} />;
}

function SignUpLink({ next }: { next: string | null }) {
  return (
    <Link href={signUpHref(next)} className="font-medium text-primary hover:underline">
      Create an account
    </Link>
  );
}

/** Guest mode keeps data in this browser only (S5). */
function GuestLink() {
  return (
    <span className="mt-2 block">
      Just looking?{" "}
      <Link href="/guest" className="font-medium text-primary hover:underline">
        Continue as guest
      </Link>
    </span>
  );
}
