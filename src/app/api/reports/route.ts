import { z } from "zod";
import { admin, getCaller, unauthorised, type Caller } from "@/lib/server/auth";
import { sendToPeople } from "@/lib/server/push";

// Problem reports. Anyone in the household can send one; the household admin is notified and
// reads them in Settings. The screenshot, if any, arrives already shrunk by the phone.

const BUCKET = "problem-reports";
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

const Send = z.object({
  message: z.string().trim().min(1).max(2000),
  diagnostics: z.record(z.string(), z.unknown()),
  screenshot: z
    .object({ type: z.enum(["image/webp", "image/jpeg", "image/png"]), data: z.string().max(4_500_000) })
    .nullable()
    .optional(),
});
const Mark = z.object({ id: z.string().uuid(), status: z.enum(["open", "fixed"]) });

async function isAdmin(caller: Caller): Promise<boolean> {
  const { data } = await admin().from("profiles").select("is_admin").eq("id", caller.userId).maybeSingle();
  return Boolean(data?.is_admin);
}

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  const parsed = Send.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a few words about what happened." }, { status: 400 });
  const { message, diagnostics, screenshot } = parsed.data;
  if (JSON.stringify(diagnostics).length > 40_000) return Response.json({ error: "Bad request." }, { status: 400 });
  const db = admin();
  const id = crypto.randomUUID();

  let screenshotPath: string | null = null;
  if (screenshot) {
    const bytes = Buffer.from(screenshot.data, "base64");
    if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return Response.json({ error: "That screenshot is too big." }, { status: 413 });
    const ext = screenshot.type.split("/")[1];
    screenshotPath = `${caller.householdId}/${id}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(screenshotPath, bytes, { contentType: screenshot.type });
    if (error) {
      console.error("report screenshot upload failed", error);
      screenshotPath = null; // the words matter more than the picture
    }
  }

  const { error } = await db.from("problem_reports").insert({
    id,
    household_id: caller.householdId,
    reported_by: caller.userId,
    message,
    screenshot_path: screenshotPath,
    diagnostics,
  });
  if (error) {
    console.error("problem report insert failed", error);
    return Response.json({ error: "Couldn't send that. Try again." }, { status: 500 });
  }

  const { data: admins } = await db
    .from("profiles")
    .select("id")
    .eq("household_id", caller.householdId)
    .eq("is_admin", true)
    .neq("id", caller.userId);
  await sendToPeople(
    (admins ?? []).map((a) => a.id),
    { title: `${caller.displayName} reported a problem`, body: message.slice(0, 120), tag: `report-${id}`, url: "/" },
  ).catch((err) => console.error("report notification failed", err));

  return Response.json({ id });
}

export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  if (!(await isAdmin(caller))) return Response.json({ error: "Only the household admin can read reports." }, { status: 403 });
  const db = admin();
  const { data, error } = await db
    .from("problem_reports")
    .select("id, message, screenshot_path, diagnostics, status, created_at, reported_by, profiles(display_name)")
    .eq("household_id", caller.householdId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: "Couldn't load reports." }, { status: 500 });
  const reports = await Promise.all(
    (data ?? []).map(async (r) => {
      const shot = r.screenshot_path
        ? (await db.storage.from(BUCKET).createSignedUrl(r.screenshot_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        id: r.id,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
        reportedBy: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? "Someone who has left",
        screenshotUrl: shot,
        diagnostics: r.diagnostics,
      };
    }),
  );
  return Response.json({ reports });
}

export async function PATCH(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  if (!(await isAdmin(caller))) return Response.json({ error: "Only the household admin can do that." }, { status: 403 });
  const parsed = Mark.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { data, error } = await admin()
    .from("problem_reports")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("household_id", caller.householdId)
    .select("id");
  if (error || !data?.length) return Response.json({ error: "Report not found." }, { status: 404 });
  return Response.json({ ok: true });
}
