import type { Metadata } from "next";
import { GuestActiveWorkoutScreen } from "@/modules/guest/ui/guest-session-screens";

export const metadata: Metadata = { title: "Workout (guest) · Gymple" };

export default function GuestActiveWorkoutPage() {
  return <GuestActiveWorkoutScreen />;
}
