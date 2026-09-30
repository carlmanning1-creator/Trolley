import { expect, test, type Page } from "@playwright/test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  admin,
  createTestHousehold,
  createTestPerson,
  removeTestHousehold,
  removeTestPerson,
  signInThroughUi,
  type TestHousehold,
  type TestPerson,
} from "./helpers";

let house: TestHousehold;
let bec: TestPerson;
let grace: TestPerson;

test.beforeAll(async () => {
  house = await createTestHousehold();
  bec = await createTestPerson("Bec", house.id);
  grace = await createTestPerson("Grace", house.id);
});
test.afterAll(async () => {
  await removeTestPerson(bec);
  await removeTestPerson(grace);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

const item = (page: Page, name: string) => page.locator(`[data-testid="list-item"][data-name="${name}"]`);
async function synced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
}
const chip = (page: Page) => page.getByRole("button", { name: /Needed soon \(\d+\)/ });

test("flag items as needed soon, and see them across every list at a glance", async ({ page, browser }) => {
  await signInThroughUi(page, bec);
  // "!" in the add box flags it.
  await page.getByLabel("Add an item").fill("!orange juice");
  await page.getByLabel("Add an item").press("Enter");
  await expect(item(page, "Orange juice")).toHaveAttribute("data-needed-soon", "true");
  await expect(page.getByText("Orange juice is flagged as needed soon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tell everyone" })).toBeVisible(); // offered, not sent

  // The ⚡ button flags the next thing added, on another list.
  await page.getByRole("navigation", { name: "Lists" }).getByRole("button", { name: /Bunnings/ }).click();
  await page.getByRole("button", { name: "Needed soon", exact: true }).click();
  await page.getByLabel("Add an item").fill("Sandpaper");
  await page.getByLabel("Add an item").press("Enter");
  await expect(item(page, "Sandpaper")).toHaveAttribute("data-needed-soon", "true");
  await expect(chip(page)).toHaveText(/Needed soon \(2\)/);
  await synced(page);

  // Grace, on her way to the shops, sees both from one tap.
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await signInThroughUi(pg, grace);
  await expect(chip(pg)).toHaveText(/Needed soon \(2\)/, { timeout: 20_000 });
  await chip(pg).click();
  await expect(pg.getByRole("region", { name: "Groceries, needed soon" })).toContainText("Orange juice");
  await expect(pg.getByRole("region", { name: "Bunnings, needed soon" })).toContainText("Sandpaper");
  await item(pg, "Orange juice").getByRole("checkbox").click();
  await expect(chip(pg)).toHaveText(/Needed soon \(1\)/);
  await expect(item(pg, "Orange juice")).toHaveCount(0);

  // Take the flag off in the editor.
  await pg.getByRole("button", { name: "Edit Sandpaper" }).click();
  const flag = pg.getByRole("button", { name: /Needed soon.*Grab it next time/ });
  await expect(flag).toHaveAttribute("aria-pressed", "true");
  await flag.click();
  await expect(flag).toHaveAttribute("aria-pressed", "false");
  await pg.keyboard.press("Escape");
  await expect(chip(pg)).toHaveCount(0);
  await synced(pg);
  await ctx.close();

  const { data } = await admin.from("item_events").select("kind, name").eq("household_id", house.id).in("kind", ["flagged", "unflagged"]);
  expect(data?.map((e) => `${e.kind}:${e.name}`).sort()).toEqual(["flagged:Orange juice", "flagged:Sandpaper", "unflagged:Sandpaper"]);
});

test("starting a shop leads with what's needed soon", async ({ page }) => {
  await signInThroughUi(page, grace);
  await page.getByLabel("Add an item").fill("!bread");
  await page.getByLabel("Add an item").press("Enter");
  await page.getByLabel("Add an item").fill("Rice");
  await page.getByLabel("Add an item").press("Enter");
  await page.getByRole("button", { name: "Start shopping" }).click();
  await page.getByRole("button", { name: "Coles" }).click();
  await expect(page.getByText("1 item is needed soon")).toBeVisible();
  await expect(chip(page)).toHaveAttribute("aria-pressed", "true");
  await expect(item(page, "Bread")).toBeVisible();
  await expect(item(page, "Rice")).toHaveCount(0);
  await chip(page).click(); // back to everything
  await expect(item(page, "Rice")).toBeVisible();
  await page.getByRole("button", { name: "Finish shopping" }).click();
  await page.getByRole("button", { name: /^Finish/ }).last().click();
  await synced(page);
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

test("Tell everyone sends only for a flagged item, and only when asked", async ({ request }) => {
  const sub = fakeSubscription(201);
  await admin
    .from("push_subscriptions")
    .insert({ profile_id: grace.id, household_id: house.id, endpoint: sub.endpoint, keys: sub.keys })
    .throwOnError();
  const flaggedId = crypto.randomUUID();
  const plainId = crypto.randomUUID();
  await admin
    .from("list_items")
    .insert([
      { id: flaggedId, household_id: house.id, list_id: house.groceriesId, name: "Orange juice", added_by: bec.id, needed_soon: true },
      { id: plainId, household_id: house.id, list_id: house.groceriesId, name: "Cheese", added_by: bec.id, needed_soon: false },
    ])
    .throwOnError();

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: bec.email });
  const { createClient } = await import("@supabase/supabase-js");
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const v = await c.auth.verifyOtp({ email: bec.email, token: link.data.properties!.email_otp, type: "email" });
  const headers = { Authorization: `Bearer ${v.data.session!.access_token}` };

  const sent = await request.post("/api/push/notify", { headers, data: { event: "needed-soon", itemId: flaggedId } });
  expect(await sent.json()).toEqual({ sent: 1, removed: 0 });
  const notFlagged = await request.post("/api/push/notify", { headers, data: { event: "needed-soon", itemId: plainId } });
  expect(await notFlagged.json()).toEqual({ sent: 0 });
});
