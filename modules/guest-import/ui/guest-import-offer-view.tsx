import { buttonClass } from "@/shared/ui/styles";
import type { ImportOutcome } from "./guest-import-flow";

export type OfferPhase = { kind: "offer" } | { kind: "importing" } | { kind: "done"; outcome: ImportOutcome };

interface Props {
  phase: OfferPhase;
  onImport: () => void;
  onDismiss: () => void;
  onClose: () => void;
}

/** The guest import offer and its result (S14). Presentational only. */
export function GuestImportOfferView({ phase, onImport, onDismiss, onClose }: Props) {
  if (phase.kind === "done" && phase.outcome.status === "imported") {
    const { summary, skipped, warning } = phase.outcome;
    return (
      <section role="status" aria-label="Guest data import" className={boxClass}>
        <p className="text-sm font-semibold text-fg">{summary}</p>
        {skipped.length > 0 && (
          <div className="text-sm text-fg-muted">
            <p>Some data could not be imported:</p>
            <ul className="mt-1 list-disc pl-5">
              {skipped.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {warning && <p className="text-sm text-danger">{warning}</p>}
        <div>
          <button type="button" onClick={onClose} className={buttonClass("secondary", "sm")}>
            Close
          </button>
        </div>
      </section>
    );
  }

  const importing = phase.kind === "importing";
  const failure = phase.kind === "done" && phase.outcome.status === "failed" ? phase.outcome.message : null;
  return (
    <section aria-label="Guest data import" className={boxClass}>
      <p className="text-sm text-fg">
        This browser has data from guest mode. Import its exercises, routines and workouts into your account? It is
        then removed from this browser.
      </p>
      {failure && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-on-danger-subtle">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onImport} disabled={importing} className={buttonClass("primary", "sm")}>
          {importing ? "Importing…" : failure ? "Try again" : "Import guest data"}
        </button>
        <button type="button" onClick={onDismiss} disabled={importing} className={buttonClass("ghost", "sm")}>
          Not now
        </button>
      </div>
    </section>
  );
}

const boxClass = "mb-6 flex flex-col gap-3 rounded-xl border border-border bg-primary-subtle p-4";
