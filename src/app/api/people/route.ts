import { z } from "zod";
import { admin, getCaller, unauthorised, type Caller } from "@/lib/server/auth";
import { PERSON_COLOURS } from "@/lib/people";

// Settings, People: the household admin sees everyone's sign-in email, adds people, and
// removes them. Everything is checked here with the secret key; the page is only a view.

type Person = { id: string; displayName: string; colour: string; email: string | null; isAdmin: boolean };

const AddBody = z.object({
  displayName: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
});
const RemoveBody = z.object({ id: z.string().uuid() });

async function adminCaller(req: Request): Promise<Caller | Response> {
  const caller = await getCaller(req);
  if (!caller) return unauthorised();
  const { data } = await admin().from("profiles").select("is_admin").eq("id", caller.userId).maybeSingle();
  if (!data?.is_admin) return Response.json({ error: "Only the household admin can manage people." }, { status: 403 });
  return caller;
}

async function people(householdId: string): Promise<Person[]> {
  const { data, error } = await admin()
    .from("profiles")
    .select("id, display_name, colour, is_admin, created_at")
    .eq("household_id", householdId)
    .order("created_at");
  if (error) throw error;
  return Promise.all(
    (data ?? []).map(async (p) => {
      const { data: u } = await admin().auth.admin.getUserById(p.id);
      return { id: p.id, displayName: p.display_name, colour: p.colour, email: u.user?.email ?? null, isAdmin: p.is_admin };
    }),
  );
}

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function GET(req: Request) {
  const caller = await adminCaller(req);
  if (caller instanceof Response) return caller;
  return Response.json({ people: await people(caller.householdId) });
}

export async function POST(req: Request) {
  const caller = await adminCaller(req);
  if (caller instanceof Response) return caller;
  const parsed = AddBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a name and a valid email address." }, { status: 400 });
  const { displayName, email } = parsed.data;
  const db = admin();

  let userId = await findUserId(email);
  if (userId) {
    const { data: existing } = await db.from("profiles").select("household_id").eq("id", userId).maybeSingle();
    if (existing) {
      const here = existing.household_id === caller.householdId;
      return Response.json(
        { error: here ? "That email is already in your household." : "That email already belongs to another household." },
        { status: 409 },
      );
    }
  }

  // Give them a colour nobody in the household is using yet, where one is free.
  const current = await people(caller.householdId);
  const taken = new Set(current.map((p) => p.colour.toLowerCase()));
  const colour = PERSON_COLOURS.find((c) => !taken.has(c)) ?? PERSON_COLOURS[current.length % PERSON_COLOURS.length];

  // Creating the account sends no email. They get a code when they ask for one at sign-in.
  let created = false;
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) return Response.json({ error: "Couldn't create the account. Try again." }, { status: 500 });
    userId = data.user.id;
    created = true;
  }
  const { error } = await db
    .from("profiles")
    .insert({ id: userId, household_id: caller.householdId, display_name: displayName, colour });
  if (error) {
    if (created) await db.auth.admin.deleteUser(userId);
    return Response.json({ error: "Couldn't add them. Try again." }, { status: 500 });
  }
  return Response.json({ people: await people(caller.householdId) });
}

export async function DELETE(req: Request) {
  const caller = await adminCaller(req);
  if (caller instanceof Response) return caller;
  const parsed = RemoveBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { id } = parsed.data;
  if (id === caller.userId) return Response.json({ error: "You can't remove yourself." }, { status: 400 });

  const db = admin();
  const { data: target } = await db.from("profiles").select("household_id, is_admin").eq("id", id).maybeSingle();
  if (!target || target.household_id !== caller.householdId) {
    return Response.json({ error: "That person isn't in your household." }, { status: 404 });
  }
  if (target.is_admin) return Response.json({ error: "Another admin can't be removed here." }, { status: 400 });

  // Deleting the account signs them out everywhere and removes their profile and devices.
  // Items they added stay on the lists, just without their name.
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return Response.json({ error: "Couldn't remove them. Try again." }, { status: 500 });
  return Response.json({ people: await people(caller.householdId) });
}
