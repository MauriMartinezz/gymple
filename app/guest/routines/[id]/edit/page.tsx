import type { Metadata } from "next";
import { GuestEditRoutineScreen } from "@/modules/guest/ui/guest-routine-screens";

export const metadata: Metadata = { title: "Edit routine (guest) · Gymple" };

export default function GuestEditRoutinePage() {
  return <GuestEditRoutineScreen />;
}
