import type { Metadata } from "next";
import Link from "next/link";
import { loadActiveSessionId, loadHistory } from "@/modules/sessions/ui/session-service";
import { plural } from "@/modules/sessions/ui/session-view";
import { StartSessionButton } from "@/modules/sessions/ui/start-session-button";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Workouts · Gymple" };

export default async function SessionsPage() {
  // Both reads resolve the session user themselves.
  const [history, activeId] = await Promise.all([loadHistory(), loadActiveSessionId()]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Workouts</h1>
        {activeId === null ? (
          <StartSessionButton routineId={null} label="Start free workout" size="sm" />
        ) : (
          <Link href="/sessions/active" className={buttonClass("primary", "sm")}>
            Continue workout
          </Link>
        )}
      </div>

      {activeId !== null && (
        <p className="rounded-md bg-primary-subtle px-3 py-2 text-sm text-on-primary-subtle">
          You have a workout in progress.{" "}
          <Link href="/sessions/active" className="font-medium underline">
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
          <Link href="/routines" className={`${buttonClass("secondary")} mt-5`}>
            Go to routines
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {history.map((entry) => (
            <li key={entry.id}>
              <Link href={`/sessions/${entry.id}`} className="block px-4 py-3 hover:bg-surface-sunken">
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
