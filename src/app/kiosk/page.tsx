import type { Metadata } from "next";
import { App } from "@/components/App";
import { AuthProvider } from "@/components/AuthProvider";
import { KioskWakeLock } from "@/components/KioskWakeLock";

export const metadata: Metadata = { title: "Kitchen list" };

// Full-screen Groceries list for the kitchen display: add box and list, no settings clutter.
export default function KioskPage() {
  return (
    <AuthProvider>
      <KioskWakeLock />
      <App mode="kiosk" />
    </AuthProvider>
  );
}
