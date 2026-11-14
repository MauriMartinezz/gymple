"use client";

import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import type { GuestStorage } from "@/modules/guest/storage/guest-storage";
import { guestStorage } from "@/modules/guest/ui/guest-runtime";
import type { GuestImportResult } from "../application/import-guest-data";
import { importGuestDataAction } from "./actions";
import { dismissOffer, isOfferDismissed, runGuestImport, shouldOfferImport } from "./guest-import-flow";
import { GuestImportOfferView, type OfferPhase } from "./guest-import-offer-view";

interface Props {
  storage?: GuestStorage;
  importAction?: (payload: string) => Promise<GuestImportResult>;
}

/**
 * Offers to import guest data on signed-in pages (S14). It reads this
 * browser's storage only on the client (the server render has no markup),
 * and it sends nothing until the user presses "Import guest data".
 */
export function GuestImportOffer({ storage = guestStorage, importAction = importGuestDataAction }: Props) {
  const subscribe = useCallback((listener: () => void) => storage.subscribe(listener), [storage]);
  const available = useSyncExternalStore(
    subscribe,
    () => shouldOfferImport(storage.read(), isOfferDismissed()),
    () => false,
  );
  const [phase, setPhase] = useState<OfferPhase | null>({ kind: "offer" });
  const [, startTransition] = useTransition();

  // A result stays on screen after the import cleared the guest data.
  if (!phase || (phase.kind === "offer" && !available)) return null;

  const startImport = () => {
    setPhase({ kind: "importing" });
    startTransition(async () => {
      const outcome = await runGuestImport(storage, importAction);
      setPhase({ kind: "done", outcome });
    });
  };

  return (
    <GuestImportOfferView
      phase={phase}
      onImport={startImport}
      onDismiss={() => {
        dismissOffer();
        setPhase(null);
      }}
      onClose={() => setPhase(null)}
    />
  );
}
