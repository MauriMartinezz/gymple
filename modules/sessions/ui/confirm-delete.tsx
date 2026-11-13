import { buttonClass } from "@/shared/ui/styles";

interface ConfirmDeleteProps {
  action: (formData: FormData) => Promise<void>;
  sessionId: number;
  /** The button that opens the confirmation, e.g. "Discard workout". */
  label: string;
  question: string;
  confirmLabel: string;
}

/**
 * A destructive action behind an explicit confirmation step: the first button
 * only reveals the question; the second one submits.
 */
export function ConfirmDelete({ action, sessionId, label, question, confirmLabel }: ConfirmDeleteProps) {
  return (
    <details className="group">
      <summary className={`${buttonClass("ghost")} cursor-pointer list-none`}>{label}</summary>
      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-4">
        <p className="text-sm text-fg">{question}</p>
        <form action={action}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button type="submit" className={buttonClass("danger", "sm")}>
            {confirmLabel}
          </button>
        </form>
      </div>
    </details>
  );
}
