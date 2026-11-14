"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/shared/ui/styles";
import { deleteGuestData } from "./delete-guest-data";
import { guestStorage } from "./guest-runtime";

/** "Delete guest data" with a confirmation step; clears everything in this browser. */
export function DeleteGuestDataButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={buttonClass("ghost", "sm")}>
        Delete guest data
      </button>
    );
  }

  const confirm = () => {
    const result = deleteGuestData(guestStorage);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfirming(false);
    setError(null);
    router.push("/guest");
  };

  return (
    <div role="alertdialog" aria-labelledby="delete-guest-data-title" className="flex flex-wrap items-center gap-2">
      <p id="delete-guest-data-title" className="text-sm text-fg">
        Delete all guest exercises and routines from this browser? This cannot be undone.
      </p>
      <button type="button" onClick={confirm} className={buttonClass("danger", "sm")}>
        Delete everything
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        className={buttonClass("secondary", "sm")}
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
