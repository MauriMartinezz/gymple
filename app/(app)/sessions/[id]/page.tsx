import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSessionAction } from "@/modules/sessions/ui/actions";
import { ConfirmDelete } from "@/modules/sessions/ui/confirm-delete";
import { loadSessionDetail, parseSessionId } from "@/modules/sessions/ui/session-service";
import { plural } from "@/modules/sessions/ui/session-view";
import { SetRow } from "@/modules/sessions/ui/set-forms";

export const metadata: Metadata = { title: "Workout · Gymple" };

export default async function SessionDetailPage({ params }: PageProps<"/sessions/[id]">) {
  const id = parseSessionId((await params).id);
  // Another user's workout, or one still in progress, looks exactly like a missing one.
  const session = id ? await loadSessionDetail(id) : null;
  if (!session) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/sessions" className="text-sm font-medium text-fg-muted hover:text-fg">
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
                <SetRow
                  key={`${set.id}-${set.setNumber}-${set.weightKg}-${set.reps}-${set.rpe}-${set.restSeconds}`}
                  sessionId={session.id}
                  set={set}
                  exerciseName={group.name}
                />
              ))}
            </ol>
          </section>
        );
      })}

      <div className="border-t border-border pt-4">
        <ConfirmDelete
          action={deleteSessionAction}
          sessionId={session.id}
          label="Delete workout"
          question="Delete this workout and all its sets? This can't be undone."
          confirmLabel="Yes, delete workout"
        />
      </div>
    </section>
  );
}
