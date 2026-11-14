import type { Metadata } from "next";
import { requireAdmin } from "@/modules/auth/infrastructure/session";
import { createTrainerAction } from "@/modules/admin/ui/actions";
import { TrainerForm } from "@/modules/admin/ui/trainer-form";

export const metadata: Metadata = { title: "New trainer · Admin · Gymple" };

export default async function NewTrainerPage() {
  await requireAdmin();

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">New trainer</h1>
        <p className="text-sm text-fg-muted">
          Creates a verified account and emails the trainer a link to choose a password.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6">
        <TrainerForm action={createTrainerAction} submitLabel="Create trainer" />
      </div>
    </section>
  );
}
