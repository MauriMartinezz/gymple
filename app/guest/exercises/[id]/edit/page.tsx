import type { Metadata } from "next";
import { GuestEditExerciseScreen } from "@/modules/guest/ui/guest-exercise-screens";

export const metadata: Metadata = { title: "Edit exercise (guest) · Gymple" };

export default function GuestEditExercisePage() {
  return <GuestEditExerciseScreen />;
}
