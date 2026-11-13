import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateExerciseAction } from "@/modules/exercises/ui/actions";
import { ExerciseForm } from "@/modules/exercises/ui/exercise-form";
import { loadExercise, parseExerciseId } from "@/modules/exercises/ui/exercise-service";

export const metadata: Metadata = { title: "Edit exercise · Gymple" };

export default async function EditExercisePage({ params }: PageProps<"/exercises/[id]/edit">) {
  const id = parseExerciseId((await params).id);
  // Another user's exercise looks exactly like a missing one.
  const exercise = id ? await loadExercise(id) : null;
  if (!exercise) notFound();

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Edit exercise</h1>
      <div className="rounded-xl border border-border bg-surface p-6">
        <ExerciseForm
          action={updateExerciseAction.bind(null, exercise.id)}
          initialValues={{
            name: exercise.name,
            muscleGroup: exercise.muscleGroup,
            notes: exercise.notes ?? "",
          }}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}
