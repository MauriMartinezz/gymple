import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadMyPrefillSuggestions } from "@/modules/coaching/ui/feedback-service";
import { ActiveSession } from "@/modules/sessions/ui/active-session";
import { loadActiveSession } from "@/modules/sessions/ui/session-service";
import { formatDate } from "@/modules/sessions/ui/session-view";

export const metadata: Metadata = { title: "Workout · Gymple" };

export default async function ActiveSessionPage() {
  // Both loaders resolve the session user themselves.
  const view = await loadActiveSession(await loadMyPrefillSuggestions());
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
