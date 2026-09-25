// A small log of recent errors on this device, attached to problem reports so a bug can be
// traced without anyone opening developer tools. Kept in this browser only, newest 50.

const KEY = "trolley-errors";
const MAX_ENTRIES = 50;
const MAX_LENGTH = 400;

export type LoggedError = { at: string; kind: "error" | "warning" | "crash"; message: string };

// Sign-in tokens and keys must never end up in a report.
function scrub(text: string): string {
  return text
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [hidden]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/sb_(publishable|secret)_[\w-]+/g, "[key]")
    .slice(0, MAX_LENGTH);
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function readErrors(): LoggedError[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as LoggedError[];
  } catch {
    return [];
  }
}

export function logError(kind: LoggedError["kind"], ...parts: unknown[]) {
  try {
    const entry: LoggedError = { at: new Date().toISOString(), kind, message: scrub(parts.map(describe).join(" ")) };
    localStorage.setItem(KEY, JSON.stringify([...readErrors(), entry].slice(-MAX_ENTRIES)));
  } catch {
    // Storage full or blocked: the log is a nicety, never a reason to fail.
  }
}

let installed = false;

// Records uncaught errors and the app's own warnings, while still showing them as before.
export function installErrorLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => logError("crash", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => logError("crash", e.reason));
  const { error, warn } = console;
  console.error = (...args: unknown[]) => {
    logError("error", ...args);
    error(...args);
  };
  console.warn = (...args: unknown[]) => {
    logError("warning", ...args);
    warn(...args);
  };
}
