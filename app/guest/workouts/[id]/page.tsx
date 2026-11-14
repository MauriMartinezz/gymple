import type { Metadata } from "next";
import { GuestWorkoutDetailScreen } from "@/modules/guest/ui/guest-session-screens";

export const metadata: Metadata = { title: "Workout (guest) · Gymple" };

export default function GuestWorkoutDetailPage() {
  return <GuestWorkoutDetailScreen />;
}
