import type { FinishSessionErrors, SetCommandErrors } from "../application/session-use-cases";
import type { SetFormValues } from "./parse-session-form";

/** Form states shared by the server actions and the guest (browser) form functions. */

export interface StartSessionState {
  error?: string;
  /** Set when another workout is active, to link to it. */
  activeSessionId?: number;
}

export interface SetFormState {
  errors: SetCommandErrors & { form?: string };
  /** The submitted values when they were rejected; null after a success. */
  values: SetFormValues | null;
}

export interface DeleteSetState {
  error?: string;
}

export interface FinishFormState {
  errors: FinishSessionErrors & { form?: string };
  values: { notes: string };
}

export type SetFormAction = (state: SetFormState, formData: FormData) => Promise<SetFormState>;
export type DeleteSetAction = (state: DeleteSetState, formData: FormData) => Promise<DeleteSetState>;
export type FinishFormAction = (state: FinishFormState, formData: FormData) => Promise<FinishFormState>;
export type StartSessionAction = (state: StartSessionState, formData: FormData) => Promise<StartSessionState>;
