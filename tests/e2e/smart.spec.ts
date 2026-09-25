import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
let person: TestPerson;

test.beforeAll(async () => {
  house = await createTestHousehold();
  person = await createTestPerson("Smart", house.id);
});
test.afterAll(async () => {
  await removeTestPerson(person);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

const DAY = 24 * 60 * 60 * 1000;
const item = (page: Page, name: string) => page.locator(`[data-testid="list-item"][data-name="${name}"]`);
async function add(page: Page, text: string) {
  await page.getByLabel("Add an item").fill(text);
  await page.getByLabel("Add an item").press("Enter");
}
async function synced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
}

// A product bought on the Groceries list this many days ago.
async function productWithHistory(name: string, daysAgo: number[], aisle = "Pantry") {
  const id = randomUUID();
  await admin
    .from("products")
    .insert({ id, household_id: house.id, name, aisle_id: house.aisles[aisle] })
    .throwOnError();
  await admin
    .from("purchases")
    .insert(
      daysAgo.map((d) => ({
        household_id: house.id,
        product_id: id,
        list_id: house.groceriesId,
        bought_by: person.id,
        bought_at: new Date(Date.now() - d * DAY).toISOString(),
      })),
    )
    .throwOnError();
  return id;
}

test("ticking something off keeps it as a purchase; a quick untick takes it back", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Bananas");
  await item(page, "Bananas").getByRole("checkbox").click();
  await synced(page);
  const history = async () =>
    (await admin.from("purchases").select("deleted_at, list_id, products!inner(name)").eq("household_id", house.id).eq("products.name", "Bananas")).data ?? [];
  await expect.poll(async () => (await history()).filter((p) => !p.deleted_at).length).toBe(1);
  expect((await history())[0].list_id).toBe(house.groceriesId);

  await page.getByRole("button", { name: /In the trolley/ }).click();
  await item(page, "Bananas").getByRole("checkbox").click();
  await synced(page);
  await expect.poll(async () => (await history()).filter((p) => !p.deleted_at).length).toBe(0);
});

test("Running low suggests what's usually due, adds it in one tap, and can be told not to", async ({ page }) => {
  await productWithHistory("Weet-bix", [15, 10, 5], "Pantry"); // every 5 days, due now
  const bread = await productWithHistory("Sourdough", [20, 10, 1], "Bakery"); // every 10 days, bought yesterday
  await productWithHistory("Coffee beans", [42, 28, 14], "Pantry"); // every 2 weeks, due now

  await signInThroughUi(page, person);
  await expect(page.getByRole("button", { name: /2 things might be running low/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Running low/ }).click();

  const rows = page.getByTestId("running-low-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Weet-bix" })).toContainText("Usually every 5 days · last bought 5 days ago");
  await expect(rows.filter({ hasText: "Coffee beans" })).toContainText("Usually every 2 weeks · last bought 2 weeks ago");

  await page.getByRole("button", { name: "Add Weet-bix" }).click();
  await expect(page.getByRole("button", { name: "Weet-bix is already on the list" })).toBeDisabled();

  await page.getByRole("button", { name: "Don't suggest Coffee beans" }).click();
  await expect(rows.filter({ hasText: "Coffee beans" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await expect(item(page, "Weet-bix")).toBeVisible();
  await synced(page);
  const { data: coffee } = await admin.from("products").select("hide_running_low").eq("household_id", house.id).eq("name", "Coffee beans").single();
  expect(coffee?.hide_running_low).toBe(true);
  const { data: sourdough } = await admin.from("products").select("hide_running_low").eq("id", bread).single();
  expect(sourdough?.hide_running_low).toBe(false);
});

test("the picture shows where it came from, and a wrong one is never used again", async ({ page }) => {
  const id = randomUUID();
  const source = `https://example.com/products/${id}`;
  await admin
    .from("products")
    .insert({
      id,
      household_id: house.id,
      name: "Qzxv blorp gadget",
      aisle_id: house.aisles["Other"],
      image_path: `${house.id}/${id}-web.webp`,
      image_source: "web",
      image_source_url: source,
    })
    .throwOnError();
  await admin
    .from("list_items")
    .insert({ household_id: house.id, list_id: house.groceriesId, product_id: id, aisle_id: house.aisles["Other"], name: "Qzxv blorp gadget", added_by: person.id })
    .throwOnError();

  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Edit Qzxv blorp gadget" }).click();
  await page.getByText("More: link, aisle, picture, staple").click();
  await expect(page.getByText("From example.com")).toBeVisible();
  await expect(page.getByRole("link", { name: "View source" })).toHaveAttribute("href", source);

  await page.getByRole("button", { name: "Wrong picture" }).click();
  await expect(page.getByText(/Swapped for the next best picture|Removed\. Nothing else fits/)).toBeVisible({ timeout: 60_000 });
  await synced(page);
  const { data } = await admin.from("products").select("rejected_sources, image_source_url").eq("id", id).single();
  expect(data?.rejected_sources).toEqual([source]);
  expect(data?.image_source_url).not.toBe(source);
});

test("going from one sheet straight to another leaves the new one open, and Back still closes it", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Lists" }).click();
  await page.getByRole("button", { name: "Add, rename or reorder lists" }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: /Scan or review receipts/ }).click();
  await page.waitForTimeout(500);
  await expect(page.getByLabel("Upload a receipt photo")).toBeAttached();
  await page.goBack();
  await expect(page.getByLabel("Upload a receipt photo")).not.toBeAttached();
  await expect(page.getByLabel("Add an item")).toBeVisible();
});
