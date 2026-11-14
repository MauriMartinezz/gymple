import Link from "next/link";

/** Shown on every guest page (S13). */
export function GuestBanner() {
  return (
    <div role="note" className="border-b border-border bg-primary-subtle">
      <p className="mx-auto w-full max-w-3xl px-4 py-2 text-sm text-on-primary-subtle">
        Guest mode: your data is saved only in this browser.{" "}
        <Link href="/signup" className="font-semibold underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
