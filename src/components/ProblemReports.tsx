"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectDiagnostics, loadReports, markReport, sendReport, type Report } from "@/lib/reports";

const btn = "min-h-11 rounded-xl border border-border px-3 text-sm font-medium disabled:opacity-50";

// Settings, "Report a problem": for everyone. Technical details go along automatically.
export function ReportProblem() {
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    if (!navigator.onLine) {
      setStatus({ ok: false, text: "Sending a report needs signal. Try again when you have some." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await sendReport(message.trim(), screenshot);
      setMessage("");
      setScreenshot(null);
      if (file.current) file.current.value = "";
      setDetails(null);
      setStatus({ ok: true, text: "Thanks. The report has been sent." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Couldn't send that. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => void send(e)}>
      <label htmlFor="report-message" className="text-sm text-muted">
        What happened, and what did you expect? A screenshot helps.
      </label>
      <textarea
        id="report-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="e.g. I ticked the milk but it came back"
        className="rounded-xl border border-border bg-background px-3 py-2 text-base"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => file.current?.click()}>
          {screenshot ? "Change screenshot" : "Add a screenshot"}
        </button>
        {screenshot && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{screenshot.name}</span>
            <button
              type="button"
              className={btn}
              onClick={() => {
                setScreenshot(null);
                if (file.current) file.current.value = "";
              }}
            >
              Remove
            </button>
          </>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Screenshot for the report"
          onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
        />
      </div>
      <button
        type="button"
        className="self-start text-sm text-muted underline"
        aria-expanded={details !== null}
        onClick={async () => setDetails(details === null ? JSON.stringify(await collectDiagnostics(), null, 2) : null)}
      >
        {details === null ? "What else gets sent?" : "Hide technical details"}
      </button>
      {details !== null && (
        <pre className="max-h-48 overflow-auto rounded-xl bg-surface-2 p-2 text-xs whitespace-pre-wrap">{details}</pre>
      )}
      <button
        type="submit"
        disabled={busy || !message.trim()}
        className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-contrast disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send report"}
      </button>
      <p role="status" aria-live="polite" className="text-sm">
        {status && <span className={status.ok ? "" : "text-danger"}>{status.text}</span>}
      </p>
    </form>
  );
}

// Settings, "Problem reports": for the household admin.
export function ReportsInbox() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");
  const [showFixed, setShowFixed] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setReports(await loadReports());
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : "Reading reports needs signal.");
    }
  }, []);

  useEffect(() => {
    // The reports live on the server; fetch them when this section opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function mark(r: Report, status: Report["status"]) {
    try {
      await markReport(r.id, status);
      setReports((all) => all?.map((x) => (x.id === r.id ? { ...x, status } : x)) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const shown = (reports ?? []).filter((r) => showFixed || r.status === "open");
  const fixedCount = (reports ?? []).filter((r) => r.status === "fixed").length;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      {reports === null && !error && <p className="text-muted">Loading…</p>}
      {reports && shown.length === 0 && <p className="text-muted">No open reports.</p>}
      <ul className="flex flex-col gap-2" aria-label="Problem reports">
        {shown.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3" data-testid="problem-report">
            <p className="text-sm text-muted">
              {r.reportedBy} · {new Date(r.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
              {r.status === "fixed" ? " · Fixed" : ""}
            </p>
            <p className="whitespace-pre-wrap">{r.message}</p>
            {r.screenshotUrl && (
              <a href={r.screenshotUrl} target="_blank" rel="noopener noreferrer" className="self-start text-sm underline">
                View screenshot
              </a>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm text-muted">Technical details</summary>
              <pre className="max-h-48 overflow-auto rounded-xl bg-background p-2 text-xs whitespace-pre-wrap">
                {JSON.stringify(r.diagnostics, null, 2)}
              </pre>
            </details>
            <button type="button" className={`${btn} self-start`} onClick={() => void mark(r, r.status === "open" ? "fixed" : "open")}>
              {r.status === "open" ? "Mark fixed" : "Reopen"}
            </button>
          </li>
        ))}
      </ul>
      {fixedCount > 0 && (
        <button type="button" className="self-start text-sm text-muted underline" onClick={() => setShowFixed((s) => !s)}>
          {showFixed ? "Hide fixed reports" : `Show ${fixedCount} fixed`}
        </button>
      )}
    </div>
  );
}
