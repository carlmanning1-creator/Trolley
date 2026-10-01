import { expect, test, type BrowserContext } from "@playwright/test";
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

test.beforeAll(async () => {
  house = await createTestHousehold();
  bec = await createTestPerson("Bec", house.id);
});
test.afterAll(async () => {
  await removeTestPerson(bec);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

// Test browsers are private windows, which can't subscribe to push, so stand in for the
// phone's push service with a fixed subscription.
async function fakePushService(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const fake = {
      endpoint: "https://push.invalid/nudge-phone",
      toJSON: () => ({ endpoint: "https://push.invalid/nudge-phone", keys: { p256dh: "test", auth: "test" } }),
      unsubscribe: async () => true,
    };
    PushManager.prototype.getSubscription = async () => fake as unknown as PushSubscription;
    PushManager.prototype.subscribe = async () => fake as unknown as PushSubscription;
  });
}

test("someone without notifications is reminded, and Not now puts it away", async ({ page }, info) => {
  await signInThroughUi(page, bec);
  const nudge = page.getByTestId("notify-nudge");
  await expect(nudge).toBeVisible({ timeout: 20_000 });
  if (info.project.name === "iphone") {
    await expect(nudge).toContainText("Add Trolley to your Home Screen");
    await nudge.getByRole("button", { name: "Show me how" }).click();
    await expect(nudge).toContainText("Add to Home Screen”, then “Add”");
  } else {
    await expect(nudge).toContainText(/Turn on notifications|Notifications are blocked/);
  }
  await nudge.getByRole("button", { name: "Not now" }).click();
  await expect(nudge).toBeHidden();
  await page.reload();
  await expect(page.getByLabel("Add an item")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  await expect(nudge).toBeHidden();
});

test("a phone with notifications on sees no reminder, and switching them off in Settings keeps them off", async ({ browser }, info) => {
  test.skip(info.project.name === "iphone", "iPhones only get notifications once the app is on the home screen");
  await admin.from("push_subscriptions").delete().eq("profile_id", bec.id);
  const ctx = await browser.newContext({ permissions: ["notifications"] });
  await fakePushService(ctx);
  const page = await ctx.newPage();
  await signInThroughUi(page, bec);
  await expect(page.getByLabel("Add an item")).toBeVisible({ timeout: 20_000 });
  const rows = async () => (await admin.from("push_subscriptions").select("id").eq("profile_id", bec.id)).data?.length;
  await expect.poll(rows, { timeout: 30_000 }).toBe(1);
  await expect(page.getByTestId("notify-nudge")).toBeHidden();

  await page.getByRole("button", { name: "Settings" }).click();
  const toggle = page.getByRole("switch", { name: /Notifications on this device/ });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect.poll(rows).toBe(0);

  // Opening the app again leaves them off.
  await page.reload();
  await expect(page.getByLabel("Add an item")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(5000);
  expect(await rows()).toBe(0);
  await expect(page.getByTestId("notify-nudge")).toBeHidden();
  await ctx.close();
});
