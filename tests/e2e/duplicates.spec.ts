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
let person: TestPerson;

test.beforeAll(async () => {
  house = await createTestHousehold();
  person = await createTestPerson("Dup", house.id);
});
test.afterAll(async () => {
  const { data: files } = await admin.storage.from("product-images").list(house.id);
  if (files?.length) await admin.storage.from("product-images").remove(files.map((f) => `${house.id}/${f.name}`));
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

test("similar items are flagged and can be merged into one", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Milk");
  await add(page, "Full cream milk x2");
  await add(page, "Oat milk");
  await expect(item(page, "Milk").getByRole("button", { name: /might be a duplicate/ })).toBeVisible();
  await expect(item(page, "Full cream milk").getByRole("button", { name: /might be a duplicate/ })).toBeVisible();
  // Oat milk is a different thing.
  await expect(item(page, "Oat milk").getByRole("button", { name: /might be a duplicate/ })).toHaveCount(0);

  await item(page, "Milk").getByRole("button", { name: /might be a duplicate/ }).click();
  await expect(page.getByRole("radio", { name: /^Milk/ })).toBeChecked(); // the first one added
  await page.getByRole("button", { name: "Merge into one" }).click();
  await expect(item(page, "Full cream milk")).toHaveCount(0);
  await expect(item(page, "Milk")).toContainText("×3");
  await expect(page.getByRole("button", { name: /might be a duplicate/ })).toHaveCount(0);
  await synced(page);
});

test("'Keep both' clears the flag for good, on every device", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Bread");
  await add(page, "White bread");
  await item(page, "Bread").getByRole("button", { name: /might be a duplicate/ }).click();
  await page.getByRole("button", { name: "Keep both" }).click();
  await expect(page.getByRole("button", { name: /might be a duplicate/ })).toHaveCount(0);
  await synced(page);
  const { data } = await admin.from("list_items").select("name, distinct_from").eq("household_id", house.id).in("name", ["Bread", "White bread"]);
  expect(data?.every((r) => (r.distinct_from as string[]).length === 1)).toBe(true);
  await page.reload();
  await expect(item(page, "White bread")).toBeVisible();
  await expect(page.getByRole("button", { name: /might be a duplicate/ })).toHaveCount(0);
});

test("the note narrows the picture search", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Hose");
  await synced(page);
  await page.getByRole("button", { name: "Edit Hose" }).click();
  await page.getByLabel("Note").fill("garden one please");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(item(page, "Hose").locator("img")).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => (await admin.from("products").select("image_source").eq("household_id", house.id).eq("name", "Hose").single()).data?.image_source, { timeout: 20_000 })
    .not.toBe("none");
});
