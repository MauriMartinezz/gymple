import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/infrastructure/session";
import { updateTrainerAction } from "@/modules/admin/ui/actions";
import { loadTrainer, parseUserId } from "@/modules/admin/ui/admin-service";
import { TrainerForm } from "@/modules/admin/ui/trainer-form";

export const metadata: Metadata = { title: "Edit trainer · Admin · Gymple" };

export default async function EditTrainerPage({ params }: PageProps<"/admin/trainers/[id]/edit">) {
  await requireAdmin();
  const id = parseUserId((await params).id);
  // A plain account looks like a missing trainer.
  const trainer = id ? await loadTrainer(id) : null;
  if (!trainer) notFound();

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Edit trainer</h1>
      <div className="rounded-xl border border-border bg-surface p-6">
        <TrainerForm
          action={updateTrainerAction.bind(null, trainer.userId)}
          initialValues={{ name: trainer.name, email: trainer.email, dni: trainer.dni }}
          submitLabel="Save changes"
          emailHint="A new email must be verified again: we'll send a link to it."
        />
      </div>
    </section>
  );
}
