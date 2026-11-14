import type { Metadata } from "next";
import { GuestFinishWorkoutScreen } from "@/modules/guest/ui/guest-session-screens";

export const metadata: Metadata = { title: "Finish workout (guest) · Gymple" };

export default function GuestFinishWorkoutPage() {
  return <GuestFinishWorkoutScreen />;
}
