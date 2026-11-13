import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActiveSession } from "@/modules/sessions/ui/active-session";
import { loadActiveSession } from "@/modules/sessions/ui/session-service";
import { formatDate } from "@/modules/sessions/ui/session-view";

export const metadata: Metadata = { title: "Workout · Gymple" };

export default async function ActiveSessionPage() {
  // Resolves the session user itself.
  const view = await loadActiveSession();
  if (!view) redirect("/sessions");

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{view.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">Started {formatDate(view.startedAt)}</p>
      </div>
      <ActiveSession view={view} />
    </section>
  );
}
