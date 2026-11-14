import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/modules/auth/infrastructure/session";
import { AuthCard } from "@/modules/auth/ui/auth-card";
import { loginHref, signUpHref } from "@/modules/auth/ui/return-path";
import { loadJoinPreview } from "@/modules/coaching/ui/coaching-service";
import { JoinForm } from "@/modules/coaching/ui/join-form";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Join a trainer · Gymple" };

/*
 * A trainer's profile link (S11). Outside the (app) group so that a
 * signed-out visitor is offered sign-in or sign-up and comes back here.
 */
export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <AuthCard title="Join a trainer">
        <Suspense fallback={<p className="text-center text-fg-subtle">Loading…</p>}>
          <JoinContent params={params} />
        </Suspense>
      </AuthCard>
    </main>
  );
}

async function JoinContent({ params }: { params: PageProps<"/join/[code]">["params"] }) {
  const { code } = await params;
  const here = `/join/${encodeURIComponent(code)}`;

  if (!(await getCurrentUser())) {
    return (
      <Message heading="Sign in to join" body="Sign in or create an account, and you'll come back here to join your trainer.">
        <Link href={loginHref(here)} className={buttonClass("primary")}>
          Sign in
        </Link>
        <Link href={signUpHref(here)} className={buttonClass("secondary")}>
          Create an account
        </Link>
      </Message>
    );
  }

  // Resolves the session user itself (requireUser).
  const preview = await loadJoinPreview(code);
  switch (preview.status) {
    case "can_join":
      return (
        <Message heading={preview.trainer.name} body={`Join ${preview.trainer.name} as a student? They will see your finished workouts.`}>
          <JoinForm code={code} trainerName={preview.trainer.name} />
        </Message>
      );
    case "already_student":
      return (
        <Message heading={preview.trainer.name} body={`You already train with ${preview.trainer.name}.`}>
          <TrainersLink />
        </Message>
      );
    case "not_accepting":
      return (
        <Message heading={preview.trainer.name} body={`${preview.trainer.name} is not accepting students right now.`}>
          <TrainersLink />
        </Message>
      );
    case "own_link":
      return (
        <Message heading="This is your invite link" body="Share it with your students so they can join you.">
          <Link href="/students" className={buttonClass("secondary")}>
            Go to your students
          </Link>
        </Message>
      );
    case "unknown":
      return (
        <Message heading="This invite link is not valid" body="Ask your trainer for their current link.">
          <TrainersLink />
        </Message>
      );
  }
}

function Message({ heading, body, children }: { heading: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 text-center">
      <h2 className="text-lg font-semibold text-fg">{heading}</h2>
      <p className="text-sm text-fg-muted">{body}</p>
      {children}
    </div>
  );
}

function TrainersLink() {
  return (
    <Link href="/trainers" className={buttonClass("secondary")}>
      Go to my trainers
    </Link>
  );
}
