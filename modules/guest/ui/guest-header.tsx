import Link from "next/link";
import { DeleteGuestDataButton } from "./delete-guest-data-button";

/** Guest navigation: same look as the signed-in header, guest routes only. */
export function GuestHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-14 w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-5">
          <Link href="/guest" className="text-lg font-bold tracking-tight text-fg">
            Gym<span className="text-primary">ple</span>
          </Link>
          <Link href="/guest/exercises" className="text-sm font-medium text-fg-muted hover:text-fg">
            Exercises
          </Link>
          <Link href="/guest/routines" className="text-sm font-medium text-fg-muted hover:text-fg">
            Routines
          </Link>
        </nav>
        <DeleteGuestDataButton />
      </div>
    </header>
  );
}
