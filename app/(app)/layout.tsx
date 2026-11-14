import Link from "next/link";
import { Suspense } from "react";
import { isCurrentUserAdmin, requireUser } from "@/modules/auth/infrastructure/session";
import { SignOutButton } from "@/modules/auth/ui/sign-out-button";
import { isCurrentUserActiveTrainer } from "@/modules/coaching/ui/coaching-service";

/*
 * Every route in this group requires a signed-in user.
 * The shell is prerendered; anything that reads the session streams in
 * inside <Suspense> (required by cacheComponents).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-14 w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-5">
            <Link href="/" className="text-lg font-bold tracking-tight text-fg">
              Gym<span className="text-primary">ple</span>
            </Link>
            <Link href="/exercises" className="text-sm font-medium text-fg-muted hover:text-fg">
              Exercises
            </Link>
            <Link href="/routines" className="text-sm font-medium text-fg-muted hover:text-fg">
              Routines
            </Link>
            <Link href="/sessions" className="text-sm font-medium text-fg-muted hover:text-fg">
              Workouts
            </Link>
            <Link href="/trainers" className="text-sm font-medium text-fg-muted hover:text-fg">
              Trainers
            </Link>
            <Suspense fallback={null}>
              <StudentsLink />
            </Suspense>
            <Suspense fallback={null}>
              <AdminLink />
            </Suspense>
          </nav>
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Suspense fallback={<p className="text-fg-subtle">Loading…</p>}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </main>
    </div>
  );
}

async function AuthGate({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-fg-muted sm:inline">{user.email}</span>
      <SignOutButton />
    </div>
  );
}

/** Only admins see the link; the admin pages check the flag again on the server. */
async function AdminLink() {
  if (!(await isCurrentUserAdmin())) return null;
  return (
    <Link href="/admin" className="text-sm font-medium text-fg-muted hover:text-fg">
      Admin
    </Link>
  );
}

/** Only active trainers see the link; the students pages check it again on the server. */
async function StudentsLink() {
  if (!(await isCurrentUserActiveTrainer())) return null;
  return (
    <Link href="/students" className="text-sm font-medium text-fg-muted hover:text-fg">
      Students
    </Link>
  );
}
