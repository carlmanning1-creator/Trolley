import { expect, test, type Page } from "@playwright/test";
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
async function synced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
}
async function openHistory(page: Page) {
  await page.getByRole("button", { name: "Lists" }).click();
  await page.getByRole("button", { name: /History/ }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
}

test("History shows who added, ticked and deleted what, and when; the editor shows who last bought it", async ({ page, browser }) => {
  await signInThroughUi(page, carl);
  await add(page, "Milk");
  await add(page, "Chain");
  await item(page, "Milk").getByRole("checkbox").click();
  await synced(page);

  // Bec deletes something on her phone.
  const ctx = await browser.newContext();
  const pb = await ctx.newPage();
  await signInThroughUi(pb, bec);
  await pb.getByRole("button", { name: "Edit Chain" }).click();
  await pb.getByRole("button", { name: "Delete" }).click();
  // Wait until the server has it before this phone closes.
  await expect
    .poll(async () => (await admin.from("item_events").select("id").eq("household_id", house.id).eq("kind", "deleted")).data?.length)
    .toBe(1);
  await ctx.close();

  await page.reload();
  await synced(page);
  await openHistory(page);
  const today = page.getByRole("region", { name: "Today" });
  const rows = today.getByTestId("history-row");
  await expect(rows.filter({ hasText: "Bec deleted Chain" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Carl ticked off Milk" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Carl added Milk" })).toHaveCount(1);
  await expect(rows.first()).toContainText("Bec deleted Chain"); // newest first
  await expect(rows.first()).toContainText(/\d{1,2}:\d{2}(am|pm)/);

  // Just Bec.
  await page.getByLabel("Who").selectOption({ label: "Bec" });
  await expect(rows).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /In the trolley/ }).click();
  await page.getByRole("button", { name: "Edit Milk" }).click();
  await expect(page.getByTestId("last-bought")).toHaveText("Last bought by Carl · Today");
});
