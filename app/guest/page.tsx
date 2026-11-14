import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Guest · Gymple" };

export default function GuestHomePage() {
  return (
    <section className="flex flex-col items-start gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Try Gymple as a guest</h1>
        <p className="mt-1 text-fg-muted">
          Start by adding the exercises you train, then group them into routines. Nothing is sent to our servers.
        </p>
      </div>
      <Link href="/guest/exercises" className={buttonClass("primary")}>
        Go to exercises
      </Link>
    </section>
  );
}
