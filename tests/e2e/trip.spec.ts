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
  person = await createTestPerson("Shopper", house.id);
});
test.afterAll(async () => {
  await removeTestPerson(person);
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

test("a trip records the store, shows progress, folds the add box away, and ticks count towards it", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Milk");
  await add(page, "Bread");
  await synced(page);

  await page.getByRole("button", { name: "Start shopping" }).click();
  await expect(page.getByRole("heading", { name: "Where are you shopping?" })).toBeVisible();
  await page.getByRole("button", { name: "Woolworths" }).click();
  await expect(page.getByTestId("trip-progress")).toHaveText("2 of 2 left");
  await expect(page.getByText("Woolworths", { exact: true })).toBeVisible();

  // The add box folds away, but is one tap from coming back.
  await expect(page.getByLabel("Add an item")).toHaveCount(0);
  await page.getByRole("button", { name: "+ Add something" }).click();
  await add(page, "Eggs");
  await expect(page.getByTestId("trip-progress")).toHaveText("3 of 3 left");

  await item(page, "Milk").getByRole("checkbox").click();
  await expect(page.getByTestId("trip-progress")).toHaveText("2 of 3 left");
  await synced(page);

  const { data: trip } = await admin.from("shopping_sessions").select("id, store").eq("household_id", house.id).single();
  expect(trip?.store).toBe("woolworths");
  await expect
    .poll(async () => (await admin.from("purchases").select("session_id").eq("household_id", house.id).is("deleted_at", null)).data)
    .toEqual([{ session_id: trip!.id }]);

  // Finishing clears the ticked item, with Undo.
  await page.getByRole("button", { name: "Finish shopping" }).click();
  await page.getByRole("button", { name: /Clear 1 ticked item and finish/ }).click();
  await expect(item(page, "Milk")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: /In the trolley \(1\)/ }).click();
  await expect(item(page, "Milk")).toHaveAttribute("data-checked", "true");
  await expect(page.getByRole("button", { name: "Start shopping" })).toBeVisible();
  await synced(page);
});

test("the list follows the order a store is usually walked, once it has seen two trips there", async ({ page }) => {
  // Two past Coles trips: dairy first, then pantry, then fruit and veg at the back.
  const walk = ["Dairy & Eggs", "Pantry", "Fruit & Veg"];
  const products: Record<string, string> = {};
  for (const [i, aisle] of walk.entries()) {
    const id = randomUUID();
    products[aisle] = id;
    await admin.from("products").insert({ id, household_id: house.id, name: `Thing ${i}`, aisle_id: house.aisles[aisle] }).throwOnError();
  }
  for (const day of [14, 7]) {
    const tripId = randomUUID();
    const start = Date.now() - day * 24 * 3600_000;
    await admin
      .from("shopping_sessions")
      .insert({
        id: tripId,
        household_id: house.id,
        list_id: house.groceriesId,
        started_by: person.id,
        started_at: new Date(start).toISOString(),
        ended_at: new Date(start + 3600_000).toISOString(),
        store: "coles",
      })
      .throwOnError();
    await admin
      .from("purchases")
      .insert(
        walk.map((aisle, i) => ({
          household_id: house.id,
          product_id: products[aisle],
          list_id: house.groceriesId,
          session_id: tripId,
          bought_by: person.id,
          bought_at: new Date(start + (i + 1) * 60_000).toISOString(),
        })),
      )
      .throwOnError();
  }

  await signInThroughUi(page, person);
  await add(page, "Bananas"); // Fruit & Veg
  await add(page, "Rice"); // Pantry
  await add(page, "Cheese"); // Dairy & Eggs
  await synced(page);
  // Aisle headings, without their icons.
  const headings = async () => (await page.locator("main h3").allTextContents()).map((h) => h.replace(/^[^A-Za-z]+/, ""));
  // The usual order (the household's aisle order) before the trip.
  await expect.poll(headings).toEqual(expect.arrayContaining(["Fruit & Veg", "Dairy & Eggs", "Pantry"]));
  expect((await headings()).indexOf("Fruit & Veg")).toBeLessThan((await headings()).indexOf("Dairy & Eggs"));

  await page.getByRole("button", { name: "Start shopping" }).click();
  await page.getByRole("button", { name: "Coles" }).click();
  await expect(page.getByText("Coles · in the order you usually walk it")).toBeVisible();
  await expect.poll(async () => (await headings()).filter((h) => walk.includes(h))).toEqual(walk);

  await page.getByRole("button", { name: "Finish shopping" }).click();
  await page.getByRole("button", { name: /^Finish/ }).last().click();
  await expect(page.getByRole("button", { name: "Start shopping" })).toBeVisible();
  await synced(page);
});

test("deleting an item can be undone", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Custard");
  await page.getByRole("button", { name: "Edit Custard" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(item(page, "Custard")).toHaveCount(0);
  await expect(page.getByText("Deleted Custard")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(item(page, "Custard")).toBeVisible();
  await synced(page);
  const { data } = await admin.from("list_items").select("deleted_at").eq("household_id", house.id).eq("name", "Custard").single();
  expect(data?.deleted_at).toBeNull();
});
