import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseUserId } from "@/modules/admin/ui/parse-user-id";
import { withdrawSuggestionAction } from "@/modules/coaching/ui/feedback-actions";
import { loadStudentHistory } from "@/modules/coaching/ui/coaching-service";
import { loadStudentSuggestions } from "@/modules/coaching/ui/feedback-service";
import { SuggestionForm } from "@/modules/coaching/ui/suggestion-form";
import { plural } from "@/modules/sessions/ui/session-view";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "Student · Gymple" };

export default async function StudentPage({ params }: PageProps<"/students/[studentId]">) {
  const studentId = parseUserId((await params).studentId);
  // A non-student, or any student while the trainer is revoked, looks like a missing page.
  const [history, suggestions] = studentId
    ? await Promise.all([loadStudentHistory(studentId), loadStudentSuggestions(studentId)])
    : [null, null];
  if (!history || !suggestions) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/students" className="text-sm font-medium text-fg-muted hover:text-fg">
          ← Students
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{history.student.name}</h1>
      </div>

      <section aria-labelledby="suggestions-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="suggestions-heading" className="text-lg font-semibold text-fg">
            Load suggestions
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Prefills {history.student.name}&apos;s next workout. Their routines don&apos;t change.
          </p>
        </div>
        {suggestions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-6 py-8 text-center text-sm text-fg-muted">
            {history.student.name} has no exercises yet.
          </p>
        ) : (
          suggestions.map((row) => (
            <details key={row.exerciseId} className="rounded-xl border border-border bg-surface p-4">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-fg">{row.name}</span>
                <span className="text-sm text-fg-muted">
                  {row.suggestion
                    ? `${row.suggestion.load}${row.suggestion.sets === null ? "" : ` · ${plural(row.suggestion.sets, "set")}`}`
                    : "No suggestion"}
                </span>
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <SuggestionForm
                  key={row.suggestion ? `${row.suggestion.load}-${row.suggestion.sets}-${row.suggestion.note}` : "none"}
                  studentId={history.student.userId}
                  exerciseId={row.exerciseId}
                  exerciseName={row.name}
                  current={
                    row.suggestion && {
                      weightKg: String(row.suggestion.weightKg),
                      reps: String(row.suggestion.reps),
                      sets: row.suggestion.sets === null ? "" : String(row.suggestion.sets),
                      note: row.suggestion.note ?? "",
                    }
                  }
                />
                {row.suggestion && (
                  <form action={withdrawSuggestionAction}>
                    <input type="hidden" name="studentId" value={history.student.userId} />
                    <input type="hidden" name="exerciseId" value={row.exerciseId} />
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      Withdraw suggestion<span className="sr-only"> for {row.name}</span>
                    </button>
                  </form>
                )}
              </div>
            </details>
          ))
        )}
      </section>

      <h2 className="text-lg font-semibold text-fg">Finished workouts</h2>
      {history.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium text-fg">No finished workouts yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {history.entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/students/${history.student.userId}/workouts/${entry.id}`}
                className="block px-4 py-3 hover:bg-surface-sunken"
              >
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
