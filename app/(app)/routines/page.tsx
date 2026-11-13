import type { Metadata } from "next";
import Link from "next/link";
import { RoutineList } from "@/modules/routines/ui/routine-list";
import { loadRoutines } from "@/modules/routines/ui/routine-service";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Routines · Gymple" };

export default async function RoutinesPage() {
  const { active, archived } = await loadRoutines();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Routines</h1>
        {active.length > 0 && (
          <Link href="/routines/new" className={buttonClass("primary", "sm")}>
            New routine
          </Link>
        )}
      </div>
      <RoutineList active={active} archived={archived} />
    </section>
  );
}
