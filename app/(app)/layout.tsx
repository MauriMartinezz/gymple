import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { SignOutButton } from "@/modules/auth/ui/sign-out-button";

/*
 * Every route in this group requires a signed-in user.
 * The shell is prerendered; anything that reads the session streams in
 * inside <Suspense> (required by cacheComponents).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <nav className="flex items-center gap-5">
            <Link href="/" className="text-lg font-bold tracking-tight text-fg">
              Gym<span className="text-primary">ple</span>
            </Link>
            <Link href="/exercises" className="text-sm font-medium text-fg-muted hover:text-fg">
              Exercises
            </Link>
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
