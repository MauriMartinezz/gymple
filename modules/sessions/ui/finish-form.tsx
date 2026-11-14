"use client";

import { finishSessionAction } from "./actions";
import { FinishFormView, type FinishFormViewProps } from "./finish-form-view";

/** The signed-in finish step, wired to the server action. */
export function FinishForm(props: Omit<FinishFormViewProps, "action" | "backHref">) {
  return <FinishFormView {...props} action={finishSessionAction} backHref="/sessions/active" />;
}
