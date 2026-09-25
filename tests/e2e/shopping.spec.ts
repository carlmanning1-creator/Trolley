import { expect, test, type Page } from "@playwright/test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  admin,
  createTestHousehold,
  createTestPerson,
  refocus,
  removeTestHousehold,
  removeTestPerson,
  signInThroughUi,
  type TestHousehold,
  type TestPerson,
} from "./helpers";

let house: TestHousehold;
let carl: TestPerson;
let bec: TestPerson;

test.beforeAll(async () => {
  house = await createTestHousehold();
  carl = await createTestPerson("Carl", house.id);
  bec = await createTestPerson("Bec", house.id);
});
test.afterAll(async () => {
  await removeTestPerson(carl);
  await removeTestPerson(bec);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

const item = (page: Page, name: string) => page.locator(`[data-testid="list-item"][data-name="${name}"]`);
async function add(page: Page, text: string) {
  await page.getByLabel("Add an item").fill(text);
  await page.getByLabel("Add an item").press("Enter");
}
async function waitSynced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
}

test("start shopping shows a banner for everyone, highlights new items, and finishing clears ticked", async ({ browser }) => {
  const a = await browser.newContext({ permissions: ["notifications"] });
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await signInThroughUi(pa, carl);
  await signInThroughUi(pb, bec);
  await add(pa, "Milk");
  await waitSynced(pa);

  await pa.getByRole("button", { name: "Start shopping" }).click();
  await pa.getByRole("button", { name: "Coles" }).click();
  await expect(pa.getByTestId("trip-progress")).toHaveText("1 of 1 left");
  await waitSynced(pa);

  await refocus(pb);
  await expect(pb.getByText("Carl is at the shops. Add anything you need now.")).toBeVisible({ timeout: 15_000 });

  // Bec adds something while Carl shops: it highlights on Carl's list.
  await add(pb, "Bread");
  await waitSynced(pb);
  await refocus(pa);
  await expect(item(pa, "Bread")).toBeVisible({ timeout: 15_000 });
  await expect(item(pa, "Bread")).toHaveClass(/ring-2/);
  await expect(item(pa, "Milk")).not.toHaveClass(/ring-2/);

  // Finish: tick milk, clear ticked, trip ends everywhere.
  await item(pa, "Milk").getByRole("checkbox").click();
  await pa.getByRole("button", { name: "Finish shopping" }).click();
  await pa.getByRole("button", { name: /Clear 1 ticked item and finish/ }).click();
  await expect(pa.getByRole("button", { name: "Start shopping" })).toBeVisible();
  await expect(item(pa, "Milk")).toHaveCount(0);
  await waitSynced(pa);
  await refocus(pb);
  await expect(pb.getByText("Carl is at the shops")).toHaveCount(0, { timeout: 15_000 });

  const { data } = await admin.from("shopping_sessions").select("ended_at").eq("household_id", house.id);
  expect(data).toHaveLength(1);
  expect(data![0].ended_at).not.toBeNull();
  await a.close();
  await b.close();
});

// A browser-shaped push subscription pointing at a test endpoint that answers with `status`.
function fakeSubscription(status: number) {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-65);
  return {
    endpoint: `https://httpbin.org/status/${status}?${randomBytes(4).toString("hex")}`,
    keys: { p256dh: Buffer.from(raw).toString("base64url"), auth: randomBytes(16).toString("base64url") },
  };
}

test("the server sends shopping notifications to the others and drops dead devices", async ({ request }) => {
  const live = fakeSubscription(201);
  const dead = fakeSubscription(410);
  await admin
    .from("push_subscriptions")
    .insert([
      { profile_id: bec.id, household_id: house.id, endpoint: live.endpoint, keys: live.keys, device_label: "test" },
      { profile_id: bec.id, household_id: house.id, endpoint: dead.endpoint, keys: dead.keys, device_label: "test" },
    ])
    .throwOnError();

  const sessionId = crypto.randomUUID();
  await admin
    .from("shopping_sessions")
    .insert({ id: sessionId, household_id: house.id, list_id: house.groceriesId, started_by: carl.id })
    .throwOnError();

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: carl.email });
  const { createClient } = await import("@supabase/supabase-js");
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const v = await c.auth.verifyOtp({ email: carl.email, token: link.data.properties!.email_otp, type: "email" });
  const token = v.data.session!.access_token;

  const res = await request.post("/api/push/notify", {
    headers: { Authorization: `Bearer ${token}` },
    data: { event: "shopping-started", sessionId },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ sent: 1, removed: 1 });
  const { data: left } = await admin.from("push_subscriptions").select("endpoint").eq("profile_id", bec.id);
  expect(left?.map((r) => r.endpoint)).toEqual([live.endpoint]);

  // Bec can't use the route to pretend Carl's trip is hers.
  const noAuth = await request.post("/api/push/notify", { data: { event: "shopping-started", sessionId } });
  expect(noAuth.status()).toBe(401);

  // Bec adds an item while Carl shops: Carl's device is told, Bec's own isn't.
  const carlDevice = fakeSubscription(201);
  await admin
    .from("push_subscriptions")
    .insert({ profile_id: carl.id, household_id: house.id, endpoint: carlDevice.endpoint, keys: carlDevice.keys })
    .throwOnError();
  const itemId = crypto.randomUUID();
  await admin
    .from("list_items")
    .insert({ id: itemId, household_id: house.id, list_id: house.groceriesId, name: "Cheese", added_by: bec.id })
    .throwOnError();
  const becLink = await admin.auth.admin.generateLink({ type: "magiclink", email: bec.email });
  const bv = await c.auth.verifyOtp({ email: bec.email, token: becLink.data.properties!.email_otp, type: "email" });
  const itemRes = await request.post("/api/push/notify", {
    headers: { Authorization: `Bearer ${bv.data.session!.access_token}` },
    data: { event: "item-added", itemId },
  });
  expect(await itemRes.json()).toEqual({ sent: 1, removed: 0 });
  // Carl can't trigger an alert about Bec's item.
  const spoof = await request.post("/api/push/notify", {
    headers: { Authorization: `Bearer ${token}` },
    data: { event: "item-added", itemId },
  });
  expect(await spoof.json()).toEqual({ sent: 0 });

  await admin.from("push_subscriptions").delete().eq("household_id", house.id);
  await admin.from("shopping_sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
});
