import type { Metadata } from "next";
import Link from "next/link";
import { createRoutineAction } from "@/modules/routines/ui/actions";
import { RoutineForm } from "@/modules/routines/ui/routine-form";
import { loadExerciseOptions } from "@/modules/routines/ui/routine-service";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "New routine · Gymple" };

export default async function NewRoutinePage() {
  // Resolves the session user itself.
  const exercises = await loadExerciseOptions();

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">New routine</h1>
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        {exercises.length === 0 ? (
          <div className="text-center">
            <p className="font-medium text-fg">You need an exercise first</p>
            <p className="mt-1 text-sm text-fg-muted">
              Routines are built from your exercises. Add one, then come back.
            </p>
            <Link href="/exercises/new" className={`${buttonClass("primary")} mt-5`}>
              Add an exercise
            </Link>
          </div>
        ) : (
          <RoutineForm action={createRoutineAction} exercises={exercises} submitLabel="Create routine" />
        )}
      </div>
    </section>
  );
}
