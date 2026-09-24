import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  browserWebSocketsWork,
  refocus,
  createTestHousehold,
  createTestPerson,
  removeTestHousehold,
  removeTestPerson,
  signInThroughUi,
  type TestHousehold,
  type TestPerson,
} from "./helpers";

let house: TestHousehold;
let alice: TestPerson;
let bob: TestPerson;

test.beforeAll(async () => {
  house = await createTestHousehold();
  alice = await createTestPerson("Alice", house.id);
  bob = await createTestPerson("Bob", house.id);
});

test.afterAll(async () => {
  await removeTestPerson(alice);
  await removeTestPerson(bob);
  await removeTestHousehold(house);
});

const item = (page: Page, name: string) => page.locator(`[data-testid="list-item"][data-name="${name}"]`);

async function add(page: Page, text: string) {
  await page.getByLabel("Add an item").fill(text);
  await page.getByLabel("Add an item").press("Enter");
}

async function waitSynced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test("add, sort by aisle, tick, edit and delete", async ({ page }) => {
  await signInThroughUi(page, alice);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await add(page, "2 milk");
  await add(page, "bananas");
  await add(page, "sourdough");

  await expect(item(page, "Milk")).toBeVisible();
  await expect(item(page, "Bananas")).toBeVisible();
  await expect(item(page, "Sourdough")).toBeVisible();
  await expect(item(page, "Milk")).toContainText("×2");
  // Sorted by aisle in walk order: Fruit & Veg, Bakery, Dairy & Eggs
  const order = await page.locator('[data-testid="list-item"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-name")),
  );
  expect(order).toEqual(["Bananas", "Sourdough", "Milk"]);

  // Adding something already on the list doesn't double it up.
  await add(page, "milk");
  await expect(page.getByText("Milk is already on the list")).toBeVisible();
  await expect(item(page, "Milk")).toHaveCount(1);

  // Tick
  await item(page, "Bananas").getByRole("checkbox").click();
  await expect(page.getByRole("button", { name: /In the trolley \(1\)/ })).toBeVisible();
  await expect(item(page, "Bananas")).toHaveCount(0);

  // Edit
  await page.getByRole("button", { name: "Edit Sourdough" }).click();
  await page.getByLabel("Note").fill("sliced");
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(item(page, "Sourdough")).toContainText("sliced");

  // Delete
  await page.getByRole("button", { name: "Edit Milk" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(item(page, "Milk")).toHaveCount(0);

  // Clear ticked
  await page.getByRole("button", { name: "Clear ticked items" }).click();
  await expect(page.getByRole("button", { name: /In the trolley/ })).toHaveCount(0);

  await waitSynced(page);
  const { data } = await admin
    .from("list_items")
    .select("name, note, quantity, checked, deleted_at")
    .eq("list_id", house.groceriesId)
    .order("name");
  expect(data?.map((r) => [r.name, r.deleted_at !== null])).toEqual([
    ["Bananas", true],
    ["Milk", true],
    ["Sourdough", false],
  ]);
  expect(data?.find((r) => r.name === "Sourdough")).toMatchObject({ note: "sliced", quantity: 2 });
});

test("changes show on the other person's phone within seconds", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await signInThroughUi(pa, alice);
  await signInThroughUi(pb, bob);
  await expect(item(pb, "Sourdough")).toBeVisible();
  test.skip(!(await browserWebSocketsWork(pb)), "This machine blocks browser WebSockets");

  const start = Date.now();
  await add(pa, "Avocados");
  await expect(item(pb, "Avocados")).toBeVisible({ timeout: 5_000 });
  console.log(`Add reached the other phone in ${Date.now() - start} ms`);

  await item(pb, "Avocados").getByRole("checkbox").click();
  await pa.getByRole("button", { name: /In the trolley/ }).click();
  await expect(item(pa, "Avocados")).toHaveAttribute("data-checked", "true", { timeout: 5_000 });

  // Added-by initial shows who added it.
  await expect(item(pb, "Avocados").getByLabel("Added by Alice")).toBeVisible();
  await a.close();
  await b.close();
});

test("both phones offline: add, tick and delete, then reconnect and agree", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await signInThroughUi(pa, alice);
  await signInThroughUi(pb, bob);
  await add(pa, "Eggs");
  await add(pa, "Rice");
  await waitSynced(pa);
  await refocus(pb);
  await expect(item(pb, "Eggs")).toBeVisible({ timeout: 10_000 });
  await expect(item(pb, "Rice")).toBeVisible({ timeout: 10_000 });
  await waitSynced(pa);
  await waitSynced(pb);

  await a.setOffline(true);
  await b.setOffline(true);

  // Alice: adds apples, ticks eggs. Bob: deletes rice, adds cheese, ticks eggs too.
  await add(pa, "Apples");
  await item(pa, "Eggs").getByRole("checkbox").click();
  await expect(pa.getByTestId("sync-status")).toHaveText(/Offline, \d+ changes? waiting/);

  await pb.getByRole("button", { name: "Edit Rice" }).click();
  await pb.getByRole("button", { name: "Delete" }).click();
  await add(pb, "Cheese");
  await expect(pb.getByTestId("sync-status")).toHaveText(/Offline, \d+ changes? waiting/);

  await a.setOffline(false);
  await b.setOffline(false);
  await waitSynced(pa);
  await waitSynced(pb);
  // Each phone catches up with the other's changes (Realtime does this instantly on real phones).
  await refocus(pa);
  await refocus(pb);

  const mine = ["Apples", "Cheese", "Eggs", "Rice"];
  const snapshot = async (p: Page) => {
    const trolley = p.getByRole("button", { name: /In the trolley/ });
    if ((await trolley.count()) && (await trolley.getAttribute("aria-expanded")) === "false") await trolley.click();
    return (
      await p.locator('[data-testid="list-item"]').evaluateAll((els) =>
        els.map((e) => ({ name: e.getAttribute("data-name")!, checked: e.getAttribute("data-checked") })),
      )
    )
      .filter((r) => mine.includes(r.name))
      .map((r) => `${r.name}:${r.checked}`)
      .sort();
  };

  // Rice was deleted on Bob's phone; Eggs ticked on both; Apples and Cheese added on each.
  const expected = ["Apples:false", "Cheese:false", "Eggs:true"];
  await expect.poll(() => snapshot(pa), { timeout: 20_000 }).toEqual(expected);
  await expect.poll(() => snapshot(pb), { timeout: 20_000 }).toEqual(expected);
  await a.close();
  await b.close();
});

test("opens with no signal after the first visit", async ({ page, context }) => {
  await signInThroughUi(page, alice);
  await add(page, "Online butter");
  await waitSynced(page);
  // Wait until the service worker controls the page, so the app shell is cached.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(item(page, "Online butter")).toBeVisible();
  await add(page, "Offline bread");
  await expect(item(page, "Offline bread")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toContainText("Offline");
  await context.setOffline(false);
  await waitSynced(page);
  const { data } = await admin.from("list_items").select("name").eq("list_id", house.groceriesId).eq("name", "Offline bread");
  expect(data).toHaveLength(1);
});
