"use client";

import { callApi } from "@/lib/api";
import { db } from "@/lib/db";
import { readErrors } from "@/lib/errorLog";
import { resizeImage } from "@/lib/imageResize";
import { getStatus } from "@/lib/sync";

// Technical details sent with a problem report. Nothing here is personal beyond which phone and
// which version of the app, and the error log is scrubbed of sign-in tokens.
export async function collectDiagnostics(): Promise<Record<string, unknown>> {
  const waiting = await db().outbox.toArray();
  const byTable: Record<string, number> = {};
  for (const e of waiting) byTable[e.table] = (byTable[e.table] ?? 0) + 1;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    reportedAt: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    page: location.pathname,
    device: navigator.userAgent,
    installed: standalone,
    screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    online: navigator.onLine,
    sync: getStatus(),
    waitingChanges: { total: waiting.length, byTable, mostRetries: Math.max(0, ...waiting.map((e) => e.attempts)) },
    notifications: "Notification" in window ? Notification.permission : "unsupported",
    recentErrors: readErrors(),
  };
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function sendReport(message: string, screenshot: File | null): Promise<void> {
  let shot: { type: string; data: string } | null = null;
  if (screenshot) {
    // Big enough to read the screen, small enough to send on weak signal.
    const blob = await resizeImage(screenshot, 1400, 0.8);
    shot = { type: blob.type, data: await toBase64(blob) };
  }
  await callApi("/api/reports", {
    method: "POST",
    json: { message, diagnostics: await collectDiagnostics(), screenshot: shot },
  });
}

export type Report = {
  id: string;
  message: string;
  status: "open" | "fixed";
  createdAt: string;
  reportedBy: string;
  screenshotUrl: string | null;
  diagnostics: Record<string, unknown>;
};

export async function loadReports(): Promise<Report[]> {
  return (await callApi<{ reports: Report[] }>("/api/reports")).reports;
}

export async function markReport(id: string, status: Report["status"]): Promise<void> {
  await callApi("/api/reports", { method: "PATCH", json: { id, status } });
}
