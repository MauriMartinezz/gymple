import "server-only";
import { db } from "@/infrastructure/db/client";
import { DrizzleGuestImportWriter } from "../infrastructure/drizzle-guest-import-writer";

/** Composition root: the one place that picks the MySQL writer. */
export const guestImportWriter = new DrizzleGuestImportWriter(db);
