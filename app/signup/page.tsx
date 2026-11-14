import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/modules/auth/infrastructure/session";
import { AuthCard } from "@/modules/auth/ui/auth-card";
import { loginHref, safeReturnPath } from "@/modules/auth/ui/return-path";
import { SignUpForm } from "@/modules/auth/ui/sign-up-form";

export const metadata: Metadata = { title: "Create account · Gymple" };

type Next = Promise<string | null>;

// `?next=` (same-origin paths only) is carried to sign-in, where it applies after verification.
export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const next: Next = searchParams.then((params) => safeReturnPath(params.next));
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <RedirectIfSignedIn next={next} />
      </Suspense>
      <AuthCard
        title="Create your account"
        footer={
          <>
            Already have an account?{" "}
            <Suspense fallback={<SignInLink next={null} />}>
              <SignInLinkFor next={next} />
            </Suspense>
            <GuestLink />
          </>
        }
      >
        <Suspense fallback={<SignUpForm />}>
          <SignUpFormFor next={next} />
        </Suspense>
      </AuthCard>
    </main>
  );
}

async function RedirectIfSignedIn({ next }: { next: Next }) {
  if (await getCurrentUser()) redirect((await next) ?? "/");
  return null;
}

async function SignUpFormFor({ next }: { next: Next }) {
  return <SignUpForm next={await next} />;
}

async function SignInLinkFor({ next }: { next: Next }) {
  return <SignInLink next={await next} />;
}

function SignInLink({ next }: { next: string | null }) {
  return (
    <Link href={loginHref(next)} className="font-medium text-primary hover:underline">
      Sign in
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
