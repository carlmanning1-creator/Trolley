// Proves live sync: a change made by one person reaches another person's open connection
// within about a second, and never reaches someone in a different household.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const houseA = randomUUID();
const houseB = randomUUID();
const listA = randomUUID();
const people: string[] = [];

async function member(household: string, name: string): Promise<SupabaseClient> {
  const email = `rt-${name}-${randomUUID().slice(0, 8)}@trolley.test`;
  const u = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (u.error) throw u.error;
  people.push(u.data.user.id);
  await admin.from("profiles").insert({ id: u.data.user.id, household_id: household, display_name: name }).throwOnError();
  const c = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const v = await c.auth.verifyOtp({ email, token: link.data.properties!.email_otp, type: "email" });
  if (v.error) throw v.error;
  return c;
}

function listen(c: SupabaseClient, household: string, seen: { name: string; at: number }[]) {
  return new Promise<void>((resolve, reject) => {
    c.channel(`t-${randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "list_items", filter: `household_id=eq.${household}` },
        (p) => seen.push({ name: (p.new as { name: string }).name, at: Date.now() }),
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") resolve();
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") reject(new Error(s));
      });
  });
}

let writer: SupabaseClient;
let reader: SupabaseClient;
let outsider: SupabaseClient;

beforeAll(async () => {
  await admin.from("households").insert([{ id: houseA, name: "RT A" }, { id: houseB, name: "RT B" }]).throwOnError();
  await admin.from("lists").insert({ id: listA, household_id: houseA, name: "Groceries" }).throwOnError();
  writer = await member(houseA, "writer");
  reader = await member(houseA, "reader");
  outsider = await member(houseB, "outsider");
});

afterAll(async () => {
  await Promise.all([writer, reader, outsider].map((c) => c?.removeAllChannels()));
  for (const id of people) await admin.auth.admin.deleteUser(id);
  await admin.from("households").delete().in("id", [houseA, houseB]);
});

describe("realtime", () => {
  it("delivers a new item to another household member within about a second", async () => {
    const seen: { name: string; at: number }[] = [];
    const leaked: { name: string; at: number }[] = [];
    await listen(reader, houseA, seen);
    // The outsider even asks for household A by name; the security rules must still say no.
    await listen(outsider, houseA, leaked);
    await new Promise((r) => setTimeout(r, 1000));

    const sent = Date.now();
    await writer
      .from("list_items")
      .insert({ id: randomUUID(), household_id: houseA, list_id: listA, name: "Realtime bananas" })
      .throwOnError();

    await expect.poll(() => seen.find((s) => s.name === "Realtime bananas"), { timeout: 5000 }).toBeTruthy();
    const delay = seen.find((s) => s.name === "Realtime bananas")!.at - sent;
    console.log(`Realtime delivery took ${delay} ms`);
    expect(delay).toBeLessThan(2000);

    await new Promise((r) => setTimeout(r, 1500));
    expect(leaked).toEqual([]);
  });
});
