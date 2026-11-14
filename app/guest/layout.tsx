import { Suspense } from "react";
import { GuestBanner } from "@/modules/guest/ui/guest-banner";
import { GuestHeader } from "@/modules/guest/ui/guest-header";

/*
 * Guest mode (S5, S13): no session, no server actions, no database. Pages are
 * prerendered shells; their data is read from this browser after mount.
 * The Suspense boundary lets pages read route params on the client.
 */
export default function GuestLayout({ children }: LayoutProps<"/guest">) {
  return (
    <div className="flex flex-1 flex-col">
      <GuestHeader />
      <GuestBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Suspense fallback={<p className="text-fg-subtle">Loading…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}
