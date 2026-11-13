import type { Metadata } from "next";
import { requireUser } from "@/modules/auth/infrastructure/session";
import { createExerciseAction } from "@/modules/exercises/ui/actions";
import { ExerciseForm } from "@/modules/exercises/ui/exercise-form";

export const metadata: Metadata = { title: "New exercise · Gymple" };

export default async function NewExercisePage() {
  await requireUser();

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">New exercise</h1>
      <div className="rounded-xl border border-border bg-surface p-6">
        <ExerciseForm action={createExerciseAction} submitLabel="Create exercise" />
      </div>
    </section>
  );
}
