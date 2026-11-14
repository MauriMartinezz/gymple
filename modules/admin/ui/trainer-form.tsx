"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TRAINER_NAME_MAX } from "@/modules/trainers/domain/trainer";
import { buttonClass } from "@/shared/ui/styles";
import type { TrainerFormState, TrainerFormValues } from "./actions";
import { DNI_HINT, DNI_INPUT_MAX, FormField, formAlertClass } from "./form-field";

interface TrainerFormProps {
  action: (state: TrainerFormState, formData: FormData) => Promise<TrainerFormState>;
  initialValues?: TrainerFormValues;
  submitLabel: string;
  /** Shown under the email field, e.g. what happens when it changes. */
  emailHint?: string;
}

const emptyValues: TrainerFormValues = { name: "", email: "", dni: "" };

/** Name, email and DNI: creates a trainer account, or edits a trainer. */
export function TrainerForm({ action, initialValues = emptyValues, submitLabel, emailHint }: TrainerFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: {}, values: initialValues });
  const { errors, values, certifyEmail } = state;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {errors.form && (
        <div role="alert" className={formAlertClass}>
          <p>{errors.form}</p>
          {certifyEmail && (
            <Link
              href={`/admin/trainers/certify?email=${encodeURIComponent(certifyEmail)}`}
              className="mt-1 inline-block font-medium underline"
            >
              Certify {certifyEmail}
            </Link>
          )}
        </div>
      )}

      <FormField name="name" label="Name" defaultValue={values.name} error={errors.name} maxLength={TRAINER_NAME_MAX} />
      <FormField
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        defaultValue={values.email}
        error={errors.email}
        hint={emailHint}
      />
      <FormField
        name="dni"
        label="DNI"
        inputMode="numeric"
        defaultValue={values.dni}
        error={errors.dni}
        hint={DNI_HINT}
        maxLength={DNI_INPUT_MAX}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/admin" className={buttonClass("secondary")}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
