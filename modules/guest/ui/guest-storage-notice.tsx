"use client";

import Link from "next/link";
import type { GuestStorageFailure } from "../storage/guest-storage";
import { DeleteGuestDataButton } from "./delete-guest-data-button";

/** A clear message when guest storage cannot be used, instead of failing silently. */
export function GuestStorageNotice({ reason, message }: { reason: GuestStorageFailure; message: string }) {
  const unreadable = reason === "corrupted" || reason === "unsupported_version";
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger bg-danger-subtle p-4">
      <p className="text-sm text-on-danger-subtle">{message}</p>
      {unreadable ? (
        <>
          <p className="text-sm text-on-danger-subtle">Delete the guest data to start again.</p>
          <DeleteGuestDataButton />
        </>
      ) : (
        <Link href="/signup" className="text-sm font-semibold text-on-danger-subtle underline">
          Create an account
        </Link>
      )}
    </div>
  );
}

export function GuestLoading() {
  return <p className="text-fg-subtle">Loading…</p>;
}

/** Inline message for a failed archive/restore. */
export function GuestCommandError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
      {message}
    </p>
  );
}
