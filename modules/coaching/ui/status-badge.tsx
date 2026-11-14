import type { TrainerStatusForStudent } from "../application/coaching-use-cases";

export function TrainerStatusBadge({ status }: { status: TrainerStatusForStudent }) {
  return status === "active" ? (
    <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-on-primary-subtle">Active</span>
  ) : (
    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-fg-muted">Inactive</span>
  );
}
