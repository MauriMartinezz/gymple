"use client";

import { deleteSetAction, editSetAction, logSetAction } from "./actions";
import {
  AddExerciseFormView,
  LogSetFormView,
  SetRowView,
  type AddExerciseFormProps,
  type LogSetFormProps,
  type SetRowProps,
} from "./set-form-views";

/** The signed-in set forms, wired to the server actions. */

export function LogSetForm(props: Omit<LogSetFormProps, "action">) {
  return <LogSetFormView {...props} action={logSetAction} />;
}

export function AddExerciseForm(props: Omit<AddExerciseFormProps, "action">) {
  return <AddExerciseFormView {...props} action={logSetAction} />;
}

export function SetRow(props: Omit<SetRowProps, "editSetAction" | "deleteSetAction">) {
  return <SetRowView {...props} editSetAction={editSetAction} deleteSetAction={deleteSetAction} />;
}
