"use client";

import { supabase } from "@/lib/supabase";

// Notifications on this device. Permission is only ever asked right after a tap
// ("Start shopping" or "Turn on notifications"), which iPhones require.

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// On iPhone, notifications only work once the app is added to the home screen.
export function needsHomeScreenInstall(): boolean {
  return isIos() && !isStandalone();
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

export async function getPushState(): Promise<PushState> {
  if (needsHomeScreenInstall()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  return "Computer";
}

// One id per installed copy of the app, so re-registering this phone replaces its old
// subscription instead of adding another one (which would send everything twice).
const DEVICE_KEY = "trolley-device-id";
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

// Saves this phone's subscription for this person, and removes any older one from the same
// phone (including ones saved before phones had an id, matched by the kind of device).
async function saveSubscription(householdId: string, userId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const id = deviceId();
  const label = deviceLabel();
  const sb = supabase();
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      profile_id: userId,
      household_id: householdId,
      endpoint: sub.endpoint,
      keys: json.keys ?? {},
      device_label: label,
      device_id: id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error("Couldn't save notifications for this device. Check your signal and try again.");
  await sb.from("push_subscriptions").delete().eq("profile_id", userId).eq("device_id", id).neq("endpoint", sub.endpoint);
  await sb
    .from("push_subscriptions")
    .delete()
    .eq("profile_id", userId)
    .is("device_id", null)
    .eq("device_label", label)
    .neq("endpoint", sub.endpoint);
}

// Must be called from a tap. Returns the resulting state.
export async function enableNotifications(householdId: string, userId: string): Promise<PushState> {
  const state = await getPushState();
  if (state === "needs-install" || state === "unsupported" || state === "blocked") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await navigator.serviceWorker.ready;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "unsupported";
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await saveSubscription(householdId, userId, sub);
  return "on";
}

// On opening the app: if this phone already allows notifications (say they were switched on in
// the phone's own settings), make sure it's registered, without asking anything. Also picks up
// a subscription the phone has quietly renewed.
let checked = false;
export async function ensureNotificationsRegistered(householdId: string, userId: string): Promise<void> {
  if (checked || !pushSupported() || needsHomeScreenInstall() || Notification.permission !== "granted") return;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key || !navigator.onLine) return;
  checked = true;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    await saveSubscription(householdId, userId, sub);
  } catch (err) {
    checked = false; // try again next time the app opens
    console.warn("Couldn't register this phone for notifications", err);
  }
}

export async function disableNotifications(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  return "off";
}
