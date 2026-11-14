import type { Metadata } from "next";
import { GuestNewRoutineScreen } from "@/modules/guest/ui/guest-routine-screens";

export const metadata: Metadata = { title: "New routine (guest) · Gymple" };

export default function GuestNewRoutinePage() {
  return <GuestNewRoutineScreen />;
}
