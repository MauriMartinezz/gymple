import type { Metadata } from "next";
import { GuestExercisesScreen } from "@/modules/guest/ui/guest-exercise-screens";

export const metadata: Metadata = { title: "Exercises (guest) · Gymple" };

export default function GuestExercisesPage() {
  return <GuestExercisesScreen />;
}
