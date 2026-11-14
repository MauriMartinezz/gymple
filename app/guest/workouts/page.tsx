import type { Metadata } from "next";
import { GuestWorkoutsScreen } from "@/modules/guest/ui/guest-session-screens";

export const metadata: Metadata = { title: "Workouts (guest) · Gymple" };

export default function GuestWorkoutsPage() {
  return <GuestWorkoutsScreen />;
}
