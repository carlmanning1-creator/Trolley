"use client";

import { useEffect } from "react";
import { installErrorLog } from "@/lib/errorLog";

// Starts the on-device error log (see errorLog.ts) on every page, signed in or not.
export function ErrorLogger() {
  useEffect(() => installErrorLog(), []);
  return null;
}
