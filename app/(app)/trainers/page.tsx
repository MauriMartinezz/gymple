import type { Metadata } from "next";
import { leaveTrainerAction } from "@/modules/coaching/ui/actions";
import { loadMyTrainers } from "@/modules/coaching/ui/coaching-service";
import { loadMySuggestions } from "@/modules/coaching/ui/feedback-service";
import { TrainerStatusBadge } from "@/modules/coaching/ui/status-badge";
import { buttonClass } from "@/shared/ui/styles";

export const metadata: Metadata = { title: "My trainers · Gymple" };

// Both loaders resolve the session user themselves.
export default async function MyTrainersPage() {
  const [trainers, suggestions] = await Promise.all([loadMyTrainers(), loadMySuggestions()]);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">My trainers</h1>
        <p className="mt-1 text-fg-muted">Trainers see your finished workouts. Leave one at any time.</p>
      </div>

      {trainers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="font-medium text-fg">No trainers yet</p>
          <p className="mt-1 text-sm text-fg-muted">Ask your trainer for their invite link and open it to join.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {trainers.map((trainer) => (
            <li key={trainer.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <p className="min-w-0 flex-1 truncate font-medium text-fg">{trainer.name}</p>
              <TrainerStatusBadge status={trainer.status} />
              <form action={leaveTrainerAction}>
                <input type="hidden" name="trainerId" value={trainer.userId} />
                <button type="submit" className={buttonClass("ghost", "sm")} aria-label={`Leave ${trainer.name}`}>
                  Leave
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {trainers.some((t) => t.status === "inactive") && (
        <p className="text-sm text-fg-subtle">An inactive trainer can&apos;t see your workouts until they are certified again.</p>
      )}

      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="suggestions-heading" className="text-lg font-semibold text-fg">
              Suggested loads
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              They prefill your next workout. You can change them for that workout.
            </p>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {suggestions.map((s) => (
              <li key={`${s.trainerId}-${s.exerciseId}`} className="px-4 py-3">
                <p className="font-medium text-fg">
                  {s.exerciseName}: {s.load}
                  {s.sets && <span className="font-normal text-fg-muted"> · {s.sets}</span>}
                </p>
                <p className="text-sm text-fg-subtle">Suggested by {s.trainerName}</p>
                {s.note && <p className="mt-1 whitespace-pre-line text-sm text-fg">{s.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
