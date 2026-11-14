import type { Metadata } from "next";
import { GuestRoutinesScreen } from "@/modules/guest/ui/guest-routine-screens";

export const metadata: Metadata = { title: "Routines (guest) · Gymple" };

export default function GuestRoutinesPage() {
  return <GuestRoutinesScreen />;
}
