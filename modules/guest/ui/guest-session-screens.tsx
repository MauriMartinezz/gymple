"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getActiveSession } from "@/modules/sessions/application/session-use-cases";
import { ActiveSessionContent } from "@/modules/sessions/ui/active-session-view";
import { ConfirmDelete } from "@/modules/sessions/ui/confirm-delete";
import { FinishFormView } from "@/modules/sessions/ui/finish-form-view";
import { parseSessionId } from "@/modules/sessions/ui/parse-session-form";
import { formatDate, plural } from "@/modules/sessions/ui/session-view";
import { SetRowView } from "@/modules/sessions/ui/set-form-views";
import { StartSessionButtonView } from "@/modules/sessions/ui/start-session-button-view";
import { buttonClass } from "@/shared/ui/styles";
import { GUEST_USER_ID } from "../storage/guest-storage";
import { Missing } from "./guest-exercise-screens";
import { guestSessionDeps as deps } from "./guest-runtime";
import {
  guestDeleteSession,
  guestDeleteSet,
  guestDiscardSession,
  guestEditSet,
  guestFinishSession,
  guestLogSet,
  guestStartSession,
  loadGuestActiveSession,
  loadGuestFinishView,
  loadGuestHistory,
  loadGuestSessionDetail,
} from "./guest-session-forms";
import { GuestCommandError, GuestLoading, GuestStorageNotice } from "./guest-storage-notice";
import { useGuestData } from "./use-guest-data";

/*
 * Guest workouts (S13): the signed-in workout components, fed from this
 * browser's storage and wired to the guest form functions.
 */

const LIST = "/guest/workouts";
const ACTIVE = `${LIST}/active`;

/** Starts a guest workout and opens it; when one is active, links to it. */
export function GuestStartSessionButton(props: {
  routineId: number | null;
  label: string;
  ariaLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
}) {
  const router = useRouter();
  const action = useMemo(() => guestStartSession(deps, () => router.push(ACTIVE)), [router]);
  return <StartSessionButtonView {...props} action={action} activeHref={ACTIVE} />;
}

export function GuestWorkoutsScreen() {
  const data = useGuestData(async () => ({
    history: await loadGuestHistory(deps),
    activeId: (await getActiveSession(deps.sessions, GUEST_USER_ID))?.id ?? null,
  }));

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const { history, activeId } = data.data;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Workouts</h1>
        {activeId === null ? (
          <GuestStartSessionButton routineId={null} label="Start free workout" size="sm" />
        ) : (
          <Link href={ACTIVE} className={buttonClass("primary", "sm")}>
            Continue workout
          </Link>
        )}
      </div>

      {activeId !== null && (
        <p className="rounded-md bg-primary-subtle px-3 py-2 text-sm text-on-primary-subtle">
          You have a workout in progress.{" "}
          <Link href={ACTIVE} className="font-medium underline">
            Go to your workout
          </Link>
        </p>
      )}

      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium text-fg">No workouts yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Start one from a routine, or a free workout, and log your sets as you go.
          </p>
          <Link href="/guest/routines" className={`${buttonClass("secondary")} mt-5`}>
            Go to routines
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {history.map((entry) => (
            <li key={entry.id}>
              <Link href={`${LIST}/${entry.id}`} className="block px-4 py-3 hover:bg-surface-sunken">
                <p className="truncate font-medium text-fg">{entry.title}</p>
                <p className="mt-0.5 text-sm text-fg-subtle">
                  {entry.date} · {plural(entry.exerciseCount, "exercise")} · {plural(entry.setCount, "set")} ·{" "}
                  {entry.duration}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GuestActiveWorkoutScreen() {
  const router = useRouter();
  const data = useGuestData(() => loadGuestActiveSession(deps));
  const [error, setError] = useState<string | null>(null);
  const actions = useMemo(
    () => ({
      logSet: guestLogSet(deps),
      editSet: guestEditSet(deps),
      deleteSet: guestDeleteSet(deps),
      discard: guestDiscardSession(deps, () => router.push(LIST), setError),
    }),
    [router],
  );

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const view = data.data;
  if (!view) return <NoActiveWorkout />;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{view.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">Started {formatDate(view.startedAt)}</p>
      </div>
      <GuestCommandError message={error} />
      <ActiveSessionContent view={view} actions={actions} finishHref={`${ACTIVE}/finish`} />
    </section>
  );
}

export function GuestFinishWorkoutScreen() {
  const router = useRouter();
  const data = useGuestData(() => loadGuestFinishView(deps));
  const action = useMemo(() => guestFinishSession(deps, (id) => router.push(`${LIST}/${id}`)), [router]);

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const view = data.data;
  if (!view) return <NoActiveWorkout />;

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Finish workout</h1>
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <FinishFormView
          sessionId={view.id}
          routineName={view.routineName}
          changes={view.changes}
          action={action}
          backHref={ACTIVE}
        />
      </div>
    </section>
  );
}

export function GuestWorkoutDetailScreen() {
  const router = useRouter();
  const id = parseSessionId(useParams<{ id: string }>().id);
  const data = useGuestData(async () => (id ? loadGuestSessionDetail(deps, id) : null), String(id));
  const [error, setError] = useState<string | null>(null);
  const actions = useMemo(
    () => ({
      editSet: guestEditSet(deps),
      deleteSet: guestDeleteSet(deps),
      deleteSession: guestDeleteSession(deps, () => router.push(LIST), setError),
    }),
    [router],
  );

  if (data.status === "loading") return <GuestLoading />;
  if (data.status === "error") return <GuestStorageNotice reason={data.reason} message={data.message} />;
  const session = data.data;
  // An active workout looks like a missing one, as on the signed-in pages.
  if (!session) return <Missing what="workout" href={LIST} />;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href={LIST} className="text-sm font-medium text-fg-muted hover:text-fg">
          ← Workouts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{session.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {session.date} · {session.duration} · {plural(session.setCount, "set")}
        </p>
        {session.notes && <p className="mt-3 whitespace-pre-line text-fg">{session.notes}</p>}
      </div>

      {session.groups.map((group) => {
        const headingId = `exercise-${group.exerciseId}-heading`;
        return (
          <section
            key={group.exerciseId}
            aria-labelledby={headingId}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <h2 id={headingId} className="font-semibold text-fg">
              {group.name}
            </h2>
            <ol className="mt-2 divide-y divide-border" aria-label={`Sets of ${group.name}`}>
              {group.sets.map((set) => (
                <SetRowView
                  key={`${set.id}-${set.setNumber}-${set.weightKg}-${set.reps}-${set.rpe}-${set.restSeconds}`}
                  sessionId={session.id}
                  set={set}
                  exerciseName={group.name}
                  editSetAction={actions.editSet}
                  deleteSetAction={actions.deleteSet}
                />
              ))}
            </ol>
          </section>
        );
      })}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <GuestCommandError message={error} />
        <ConfirmDelete
          action={actions.deleteSession}
          sessionId={session.id}
          label="Delete workout"
          question="Delete this workout and all its sets? This can't be undone."
          confirmLabel="Yes, delete workout"
        />
      </div>
    </section>
  );
}

function NoActiveWorkout() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">No workout in progress</h1>
      <p className="text-fg-muted">Start a workout from a routine, or a free one.</p>
      <Link href={LIST} className={buttonClass("secondary")}>
        Go to workouts
      </Link>
    </section>
  );
}
