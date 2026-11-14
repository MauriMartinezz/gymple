"use client";

import { startSessionAction } from "./actions";
import { StartSessionButtonView, type StartSessionButtonViewProps } from "./start-session-button-view";

/** The signed-in start button, wired to the server action. */
export function StartSessionButton(props: Omit<StartSessionButtonViewProps, "action" | "activeHref">) {
  return <StartSessionButtonView {...props} action={startSessionAction} activeHref="/sessions/active" />;
}
