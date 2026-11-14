"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getExercise, listExercises } from "@/modules/exercises/application/exercise-use-cases";
import { ExerciseForm } from "@/modules/exercises/ui/exercise-form";
import { ExerciseListView } from "@/modules/exercises/ui/exercise-list-view";
import { parseExerciseId } from "@/modules/exercises/ui/parse-exercise-id";
import { buttonClass } from "@/shared/ui/styles";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { guestCreateExercise, guestSetExerciseArchived, guestUpdateExercise } from "./guest-exercise-forms";
import { guestExerciseRepository as repo } from "./guest-runtime";
import { GuestCommandError, GuestLoading, GuestStorageNotice } from "./guest-storage-notice";
import { useGuestData } from "./use-guest-data";

const LIST = "/guest/exercises";

export function GuestExercisesScreen() {
  const data = useGuestData(() => listExercises(repo, GUEST_USER_ID));
  const [error, setError] = useState<string | null>(null);
  const archive = useMemo(() => guestSetExerciseArchived(repo, true, setError), []);
  const restore = useMemo(() => guestSetExerciseArchived(repo, false, setError), []);

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const { active, archived } = data.data;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Exercises</h1>
        {active.length > 0 && (
          <Link href={`${LIST}/new`} className={buttonClass("primary", "sm")}>
            New exercise
          </Link>
        )}
      </div>
      <GuestCommandError message={error} />
      <ExerciseListView
        active={active}
        archived={archived}
        archiveAction={archive}
        restoreAction={restore}
        basePath={LIST}
      />
    </section>
  );
}

export function GuestNewExerciseScreen() {
  const router = useRouter();
  const action = useMemo(() => guestCreateExercise(repo, () => router.push(LIST)), [router]);

  return (
    <FormSection title="New exercise">
      <ExerciseForm action={action} submitLabel="Create exercise" cancelHref={LIST} />
    </FormSection>
  );
}

export function GuestEditExerciseScreen() {
  const router = useRouter();
  const id = parseExerciseId(useParams<{ id: string }>().id);
  const data = useGuestData(async () => (id ? getExercise(repo, GUEST_USER_ID, id) : null), String(id));
  const action = useMemo(() => guestUpdateExercise(repo, id ?? 0, () => router.push(LIST)), [id, router]);

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const exercise = data.data;
  if (!exercise) return <Missing what="exercise" href={LIST} />;

  return (
    <FormSection title="Edit exercise">
      <ExerciseForm
        key={exercise.id}
        action={action}
        initialValues={{ name: exercise.name, muscleGroup: exercise.muscleGroup, notes: exercise.notes ?? "" }}
        submitLabel="Save changes"
        cancelHref={LIST}
      />
    </FormSection>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      <div className="rounded-xl border border-border bg-surface p-6">{children}</div>
    </section>
  );
}

export function Missing({ what, href }: { what: string; href: string }) {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Not found</h1>
      <p className="text-fg-muted">This {what} does not exist in this browser.</p>
      <Link href={href} className={buttonClass("secondary")}>
        Back to the list
      </Link>
    </section>
  );
}
