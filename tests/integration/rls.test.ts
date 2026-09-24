// Proves row level security keeps households apart, against the real Supabase project.
// Creates a throwaway second household with its own user, checks it can see and change nothing
// of the Manning household, then removes everything it made.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MANNING = "6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01";
const TABLES = [
  "households",
  "profiles",
  "lists",
  "aisles",
  "products",
  "list_items",
  "shopping_sessions",
  "push_subscriptions",
  "receipts",
  "receipt_lines",
] as const;

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const outsiderHousehold = randomUUID();
const outsiderEmail = `rls-outsider-${Date.now()}@trolley.test`;
const insiderEmail = `rls-insider-${Date.now()}@trolley.test`;
const password = `Pw-${randomUUID()}`;
let outsiderId = "";
let insiderId = "";
let outsider: SupabaseClient;
let insider: SupabaseClient;
let manningListId = "";
let manningItemId = "";
let manningProductId = "";
let manningReceiptId = "";
const manningObject = `${MANNING}/rls-test-${Date.now()}.png`;

async function signedInClient(email: string) {
  const c = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

beforeAll(async () => {
  // A second household with one person in it.
  await admin.from("households").insert({ id: outsiderHousehold, name: "RLS test household" }).throwOnError();
  const o = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true });
  if (o.error) throw o.error;
  outsiderId = o.data.user.id;
  await admin
    .from("profiles")
    .insert({ id: outsiderId, household_id: outsiderHousehold, display_name: "Outsider" })
    .throwOnError();

  // A temporary member of the Manning household, to prove the rules still let members in.
  const i = await admin.auth.admin.createUser({ email: insiderEmail, password, email_confirm: true });
  if (i.error) throw i.error;
  insiderId = i.data.user.id;
  await admin
    .from("profiles")
    .insert({ id: insiderId, household_id: MANNING, display_name: "Insider" })
    .throwOnError();

  // Make sure every Manning table has at least one row to try to steal.
  const list = await admin.from("lists").select("id").eq("household_id", MANNING).limit(1).single();
  manningListId = list.data!.id;
  manningProductId = randomUUID();
  await admin
    .from("products")
    .insert({ id: manningProductId, household_id: MANNING, name: "RLS test product" })
    .throwOnError();
  manningItemId = randomUUID();
  await admin
    .from("list_items")
    .insert({
      id: manningItemId,
      household_id: MANNING,
      list_id: manningListId,
      product_id: manningProductId,
      name: "RLS test item",
      added_by: insiderId,
    })
    .throwOnError();
  await admin
    .from("shopping_sessions")
    .insert({ household_id: MANNING, list_id: manningListId, started_by: insiderId, ended_at: new Date().toISOString() })
    .throwOnError();
  await admin
    .from("push_subscriptions")
    .insert({
      profile_id: insiderId,
      household_id: MANNING,
      endpoint: `https://push.invalid/${randomUUID()}`,
      keys: { p256dh: "x", auth: "y" },
    })
    .throwOnError();
  manningReceiptId = randomUUID();
  await admin
    .from("receipts")
    .insert({ id: manningReceiptId, household_id: MANNING, image_path: `${MANNING}/x.jpg`, status: "failed" })
    .throwOnError();
  await admin
    .from("receipt_lines")
    .insert({ receipt_id: manningReceiptId, household_id: MANNING, description: "RLS test line" })
    .throwOnError();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const up = await admin.storage.from("product-images").upload(manningObject, png, { contentType: "image/png" });
  if (up.error) throw up.error;

  outsider = await signedInClient(outsiderEmail);
  insider = await signedInClient(insiderEmail);
});

afterAll(async () => {
  await admin.storage.from("product-images").remove([manningObject]);
  await admin.from("receipts").delete().eq("id", manningReceiptId);
  await admin.from("list_items").delete().eq("id", manningItemId);
  await admin.from("products").delete().eq("id", manningProductId);
  await admin.from("shopping_sessions").delete().eq("household_id", MANNING).eq("started_by", insiderId);
  await admin.from("push_subscriptions").delete().eq("profile_id", insiderId);
  if (outsiderId) await admin.auth.admin.deleteUser(outsiderId);
  if (insiderId) await admin.auth.admin.deleteUser(insiderId);
  await admin.from("households").delete().eq("id", outsiderHousehold);
});

describe("row level security", () => {
  it.each(TABLES)("an outsider reads nothing of the Manning household from %s", async (table) => {
    const { data, error } = await outsider.from(table).select("*");
    expect(error).toBeNull();
    const leaked = (data ?? []).filter(
      (r: Record<string, unknown>) =>
        r.household_id === MANNING || r.id === MANNING || r.profile_id === insiderId,
    );
    expect(leaked).toEqual([]);
  });

  it.each(TABLES.filter((t) => t !== "push_subscriptions"))(
    "a Manning member can read %s",
    async (table) => {
      const { data, error } = await insider.from(table).select("*").limit(5);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    },
  );

  it("a member sees only their own push subscriptions", async () => {
    const mine = await insider.from("push_subscriptions").select("profile_id");
    expect(mine.data?.length).toBeGreaterThan(0);
    expect(mine.data?.every((r) => r.profile_id === insiderId)).toBe(true);
  });

  it("an outsider cannot add items to a Manning list", async () => {
    const { error } = await outsider.from("list_items").insert({
      id: randomUUID(),
      household_id: MANNING,
      list_id: manningListId,
      name: "sneaky",
    });
    expect(error).not.toBeNull();
  });

  it("an outsider cannot smuggle an item onto a Manning list through their own household", async () => {
    const { error } = await outsider.from("list_items").insert({
      id: randomUUID(),
      household_id: outsiderHousehold,
      list_id: manningListId,
      name: "sneaky",
    });
    expect(error).not.toBeNull();
  });

  it("an outsider cannot change or delete Manning rows", async () => {
    const upd = await outsider.from("list_items").update({ name: "hacked" }).eq("id", manningItemId).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await outsider.from("list_items").delete().eq("id", manningItemId).select();
    expect(del.data ?? []).toEqual([]);
    const still = await admin.from("list_items").select("name, deleted_at").eq("id", manningItemId).single();
    expect(still.data).toEqual({ name: "RLS test item", deleted_at: null });
  });

  it("an outsider cannot move themselves into the Manning household", async () => {
    await outsider.from("profiles").update({ household_id: MANNING }).eq("id", outsiderId);
    const p = await admin.from("profiles").select("household_id").eq("id", outsiderId).single();
    expect(p.data?.household_id).toBe(outsiderHousehold);
  });

  it("nobody can make themselves a household admin", async () => {
    const res = await outsider.from("profiles").update({ is_admin: true }).eq("id", outsiderId).select();
    expect(res.error?.code).toBe("42501");
    const p = await admin.from("profiles").select("is_admin").eq("id", outsiderId).single();
    expect(p.data?.is_admin).toBe(false);
    // Ordinary profile edits still work.
    const ok = await outsider.from("profiles").update({ display_name: "Outsider" }).eq("id", outsiderId).select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
  });

  it("an outsider cannot see or download Manning photos", async () => {
    const listed = await outsider.storage.from("product-images").list(MANNING);
    expect(listed.data ?? []).toEqual([]);
    const dl = await outsider.storage.from("product-images").download(manningObject);
    expect(dl.data).toBeNull();
    const ok = await insider.storage.from("product-images").download(manningObject);
    expect(ok.error).toBeNull();
  });

  it("an outsider cannot upload into the Manning folder", async () => {
    const { error } = await outsider.storage
      .from("receipts")
      .upload(`${MANNING}/evil-${Date.now()}.png`, Buffer.from("x"), { contentType: "image/png" });
    expect(error).not.toBeNull();
  });
});
