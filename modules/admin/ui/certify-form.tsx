"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/shared/ui/styles";
import { certifyTrainerAction } from "./actions";
import { DNI_HINT, DNI_INPUT_MAX, FormField, formAlertClass } from "./form-field";

/** Finds an existing account by email and makes it a trainer. */
export function CertifyForm({ initialEmail }: { initialEmail: string }) {
  const [state, formAction, pending] = useActionState(certifyTrainerAction, {
    errors: {},
    values: { email: initialEmail, dni: "" },
  });
  const { errors, values } = state;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {errors.form && (
        <p role="alert" className={formAlertClass}>
          {errors.form}
        </p>
      )}

      <FormField
        name="email"
        label="Account email"
        type="email"
        inputMode="email"
        defaultValue={values.email}
        error={errors.email}
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
          {pending ? "Saving…" : "Certify trainer"}
        </button>
      </div>
    </form>
  );
}
