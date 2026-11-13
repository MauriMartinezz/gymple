import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateRoutineAction } from "@/modules/routines/ui/actions";
import { RoutineForm } from "@/modules/routines/ui/routine-form";
import {
  loadExerciseOptions,
  loadRoutine,
  parseRoutineId,
} from "@/modules/routines/ui/routine-service";

export const metadata: Metadata = { title: "Edit routine · Gymple" };

export default async function EditRoutinePage({ params }: PageProps<"/routines/[id]/edit">) {
  const id = parseRoutineId((await params).id);
  // Another user's routine looks exactly like a missing one.
  const routine = id ? await loadRoutine(id) : null;
  if (!routine) notFound();

  const exercises = await loadExerciseOptions(routine.items.map((item) => item.exerciseId));

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Edit routine</h1>
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <RoutineForm
          action={updateRoutineAction.bind(null, routine.id)}
          exercises={exercises}
          initialValues={{
            name: routine.name,
            description: routine.description ?? "",
            items: routine.items.map((item) => ({
              exerciseId: String(item.exerciseId),
              targetSets: String(item.targetSets),
              targetRepsMin: String(item.targetRepsMin),
              targetRepsMax: String(item.targetRepsMax),
              restSeconds: String(item.restSeconds),
              notes: item.notes ?? "",
            })),
          }}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}
