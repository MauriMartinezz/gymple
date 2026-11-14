"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getRoutine, listRoutines } from "@/modules/routines/application/routine-use-cases";
import { parseRoutineId } from "@/modules/routines/ui/parse-routine-id";
import { RoutineForm } from "@/modules/routines/ui/routine-form";
import { RoutineListView } from "@/modules/routines/ui/routine-list-view";
import { buttonClass } from "@/shared/ui/styles";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { Missing } from "./guest-exercise-screens";
import {
  guestCreateRoutine,
  guestSetRoutineArchived,
  guestUpdateRoutine,
  loadGuestExerciseOptions,
} from "./guest-routine-forms";
import { guestExerciseRepository, guestRoutineRepository as repo } from "./guest-runtime";
import { GuestCommandError, GuestLoading, GuestStorageNotice } from "./guest-storage-notice";
import { useGuestData } from "./use-guest-data";

const LIST = "/guest/routines";

export function GuestRoutinesScreen() {
  const data = useGuestData(() => listRoutines(repo, GUEST_USER_ID));
  const [error, setError] = useState<string | null>(null);
  const archive = useMemo(() => guestSetRoutineArchived(repo, true, setError), []);
  const restore = useMemo(() => guestSetRoutineArchived(repo, false, setError), []);

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const { active, archived } = data.data;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Routines</h1>
        {active.length > 0 && (
          <Link href={`${LIST}/new`} className={buttonClass("primary", "sm")}>
            New routine
          </Link>
        )}
      </div>
      <GuestCommandError message={error} />
      <RoutineListView
        active={active}
        archived={archived}
        archiveAction={archive}
        restoreAction={restore}
        basePath={LIST}
      />
    </section>
  );
}

export function GuestNewRoutineScreen() {
  const router = useRouter();
  const data = useGuestData(() => loadGuestExerciseOptions(guestExerciseRepository));
  const action = useMemo(() => guestCreateRoutine(repo, () => router.push(LIST)), [router]);

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const exercises = data.data;

  return (
    <FormSection title="New routine">
      {exercises.length === 0 ? (
        <div className="text-center">
          <p className="font-medium text-fg">You need an exercise first</p>
          <p className="mt-1 text-sm text-fg-muted">
            Routines are built from your exercises. Add one, then come back.
          </p>
          <Link href="/guest/exercises/new" className={`${buttonClass("primary")} mt-5`}>
            Add an exercise
          </Link>
        </div>
      ) : (
        <RoutineForm action={action} exercises={exercises} submitLabel="Create routine" cancelHref={LIST} />
      )}
    </FormSection>
  );
}

export function GuestEditRoutineScreen() {
  const router = useRouter();
  const id = parseRoutineId(useParams<{ id: string }>().id);
  const data = useGuestData(async () => {
    const routine = id ? await getRoutine(repo, GUEST_USER_ID, id) : null;
    if (!routine) return null;
    const exercises = await loadGuestExerciseOptions(
      guestExerciseRepository,
      routine.items.map((item) => item.exerciseId),
    );
    return { routine, exercises };
  }, String(id));
  const action = useMemo(() => guestUpdateRoutine(repo, id ?? 0, () => router.push(LIST)), [id, router]);

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  if (!data.data) return <Missing what="routine" href={LIST} />;
  const { routine, exercises } = data.data;

  return (
    <FormSection title="Edit routine">
      <RoutineForm
        key={routine.id}
        action={action}
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
        cancelHref={LIST}
      />
    </FormSection>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">{children}</div>
    </section>
  );
}
