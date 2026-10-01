import { z } from "zod";
import { admin, getCaller, unauthorised } from "@/lib/server/auth";
import { sendToPeople } from "@/lib/server/push";

// Shopping-mode notifications, and "needed soon" when someone chooses to tell everyone. The server checks the facts itself (who is shopping, who added
// what) rather than trusting the message, so nobody can use this to send arbitrary alerts.
const Body = z.discriminatedUnion("event", [
  z.object({ event: z.literal("shopping-started"), sessionId: z.string().uuid() }),
  z.object({ event: z.literal("item-added"), itemId: z.string().uuid() }),
  z.object({ event: z.literal("needed-soon"), itemId: z.string().uuid() }),
]);

const SESSION_MAX_HOURS = 6;

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const db = admin();

  if (parsed.data.event === "shopping-started") {
    const { data: session } = await db
      .from("shopping_sessions")
      .select("id, household_id, started_by, ended_at, list_id, lists(name)")
      .eq("id", parsed.data.sessionId)
      .maybeSingle();
    if (!session || session.household_id !== caller.householdId || session.started_by !== caller.userId || session.ended_at) {
      return Response.json({ error: "No active shopping trip." }, { status: 404 });
    }
    const { data: others } = await db
      .from("profiles")
      .select("id")
      .eq("household_id", caller.householdId)
      .neq("id", caller.userId);
    const listName = (session.lists as unknown as { name: string } | null)?.name;
    const result = await sendToPeople(
      (others ?? []).map((p) => p.id),
      {
        title: `${caller.displayName} is at the shops`,
        body: `Add anything you need now${listName && listName !== "Groceries" ? ` to ${listName}` : ""}.`,
        tag: `shopping-${session.id}`,
        url: "/",
      },
    );
    return Response.json({ sent: result.sent, removed: result.removed });
  }

  // needed-soon: sent only when someone taps "Tell everyone" after flagging an item. Goes to
  // everyone else in the household, and only while the item really is flagged and still needed.
  if (parsed.data.event === "needed-soon") {
    const { data: flagged } = await db
      .from("list_items")
      .select("id, name, household_id, needed_soon, checked, deleted_at")
      .eq("id", parsed.data.itemId)
      .maybeSingle();
    if (!flagged || flagged.household_id !== caller.householdId || !flagged.needed_soon || flagged.checked || flagged.deleted_at) {
      return Response.json({ sent: 0 });
    }
    const { data: others } = await db
      .from("profiles")
      .select("id, display_name")
      .eq("household_id", caller.householdId)
      .neq("id", caller.userId);
    const result = await sendToPeople(
      (others ?? []).map((p) => p.id),
      {
        title: `${caller.displayName} needs ${flagged.name} soon`,
        body: "Grab it next time you're at the shops.",
        tag: `needed-${flagged.id}`,
        url: "/",
      },
    );
    // Say who got it and who didn't, so the sender isn't told "sent" when nobody was.
    const reached = new Set(result.reached);
    return Response.json({
      sent: result.sent,
      told: (others ?? []).filter((p) => reached.has(p.id)).map((p) => p.display_name as string),
      notTold: (others ?? []).filter((p) => !reached.has(p.id)).map((p) => p.display_name as string),
    });
  }

  // item-added: tell whoever is shopping for that list, unless they added it themselves.
  const { data: item } = await db
    .from("list_items")
    .select("id, name, household_id, list_id, added_by, created_at")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (!item || item.household_id !== caller.householdId || item.added_by !== caller.userId) {
    return Response.json({ sent: 0 });
  }
  const since = new Date(Date.now() - SESSION_MAX_HOURS * 3600_000).toISOString();
  const { data: sessions } = await db
    .from("shopping_sessions")
    .select("started_by")
    .eq("list_id", item.list_id)
    .is("ended_at", null)
    .gte("started_at", since)
    .neq("started_by", caller.userId);
  const shoppers = [...new Set((sessions ?? []).map((s) => s.started_by as string).filter(Boolean))];
  const result = await sendToPeople(shoppers, {
    title: `${caller.displayName} added ${item.name}`,
    body: "It's on the list while you're at the shops.",
    tag: `item-${item.id}`,
    url: "/",
  });
  return Response.json({ sent: result.sent, removed: result.removed });
}
