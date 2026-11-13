import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinishForm } from "@/modules/sessions/ui/finish-form";
import { loadFinishView } from "@/modules/sessions/ui/session-service";

export const metadata: Metadata = { title: "Finish workout · Gymple" };

export default async function FinishSessionPage() {
  // Resolves the session user itself.
  const view = await loadFinishView();
  if (!view) redirect("/sessions");

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Finish workout</h1>
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <FinishForm sessionId={view.id} routineName={view.routineName} changes={view.changes} />
      </div>
    </section>
  );
}
