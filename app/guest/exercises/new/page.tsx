import type { Metadata } from "next";
import { GuestNewExerciseScreen } from "@/modules/guest/ui/guest-exercise-screens";

export const metadata: Metadata = { title: "New exercise (guest) · Gymple" };

export default function GuestNewExercisePage() {
  return <GuestNewExerciseScreen />;
}
