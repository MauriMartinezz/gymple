import type { Metadata } from "next";
import Link from "next/link";
import { ExerciseList } from "@/modules/exercises/ui/exercise-list";
import { loadExercises } from "@/modules/exercises/ui/exercise-service";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Exercises · Gymple" };

export default async function ExercisesPage() {
  const { active, archived } = await loadExercises();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Exercises</h1>
        {active.length > 0 && (
          <Link href="/exercises/new" className={buttonClass("primary", "sm")}>
            New exercise
          </Link>
        )}
      </div>
      <ExerciseList active={active} archived={archived} />
    </section>
  );
}
