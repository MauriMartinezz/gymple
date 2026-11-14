"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { GuestStorageError, type GuestStorage, type GuestStorageFailure } from "../storage/guest-storage";
import { guestStorage } from "./guest-runtime";

export type GuestData<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; reason: GuestStorageFailure; message: string };

/**
 * Loads guest data after mount and again whenever the guest storage changes
 * (this tab or another). The first render is always "loading", on the server
 * and in the browser, so there is no hydration mismatch.
 */
export function useGuestData<T>(load: () => Promise<T>, key = "", storage: GuestStorage = guestStorage): GuestData<T> {
  const [result, setResult] = useState<GuestData<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const runLoad = useEffectEvent(load);

  useEffect(() => storage.subscribe(() => setVersion((v) => v + 1)), [storage]);

  useEffect(() => {
    let current = true;
    runLoad().then(
      (data) => {
        if (current) setResult({ status: "ready", data });
      },
      (error: unknown) => {
        if (!current) return;
        if (error instanceof GuestStorageError) {
          setResult({ status: "error", reason: error.reason, message: error.message });
        } else {
          // Let the nearest error boundary handle anything unexpected.
          setResult(() => {
            throw error;
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [version, key]);

  return result;
}
