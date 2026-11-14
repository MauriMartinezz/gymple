import Link from "next/link";
import type { Trainer } from "@/modules/trainers/domain/trainer";
import { buttonClass } from "@/shared/ui/styles";
import { restoreTrainerAction, revokeTrainerAction } from "./actions";

/** Active and revoked trainers, most recently certified first. */
export function TrainerList({ trainers }: { trainers: Trainer[] }) {
  if (trainers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
        <p className="font-medium text-fg">No trainers yet</p>
        <p className="mt-1 text-sm text-fg-muted">
          Create a trainer account, or certify someone who already has an account.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {trainers.map((trainer) => (
        <li key={trainer.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-fg">{trainer.name}</p>
            <p className="truncate text-sm text-fg-muted">
              {trainer.email}
              {!trainer.emailVerified && <span className="text-fg-subtle"> (unverified)</span>}
            </p>
            <p className="text-sm text-fg-muted">DNI {trainer.dni}</p>
          </div>
          <StatusBadge trainer={trainer} />
          <Link
            href={`/admin/trainers/${trainer.userId}/edit`}
            className={buttonClass("ghost", "sm")}
            aria-label={`Edit ${trainer.name}`}
          >
            Edit
          </Link>
          <form action={trainer.status === "active" ? revokeTrainerAction : restoreTrainerAction}>
            <input type="hidden" name="userId" value={trainer.userId} />
            <button
              type="submit"
              className={buttonClass(trainer.status === "active" ? "ghost" : "secondary", "sm")}
              aria-label={`${trainer.status === "active" ? "Revoke" : "Restore"} ${trainer.name}`}
            >
              {trainer.status === "active" ? "Revoke" : "Restore"}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ trainer }: { trainer: Trainer }) {
  return trainer.status === "active" ? (
    <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-on-primary-subtle">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-fg-muted">Revoked</span>
  );
}
