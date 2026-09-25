import type { Metadata } from "next";
import { App } from "@/components/App";
import { AuthProvider } from "@/components/AuthProvider";
import { WakeLock } from "@/components/WakeLock";

export const metadata: Metadata = { title: "Kitchen list" };

// Full-screen Groceries list for the kitchen display: add box and list, no settings clutter.
export default function KioskPage() {
  return (
    <AuthProvider>
      <WakeLock />
      <App mode="kiosk" />
    </AuthProvider>
  );
}
