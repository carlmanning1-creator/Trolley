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
  person = await createTestPerson("Ext", house.id);
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

test("renaming an item finds the new thing's picture and leaves the old product alone", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Birthday card for Nan");
  await synced(page);
  await page.getByRole("button", { name: "Edit Birthday card for Nan" }).click();
  await page.getByLabel("Name").fill("Garden hose");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(item(page, "Garden hose").locator("img")).toBeVisible({ timeout: 60_000 });
  await synced(page);
  const { data } = await admin.from("products").select("name, image_source").eq("household_id", house.id).order("name");
  expect(data).toEqual([
    { name: "Birthday card for Nan", image_source: "none" },
    { name: "Garden hose", image_source: "commons" },
  ]);
});

test("adding then renaming with no signal syncs cleanly afterwards", async ({ page, context }) => {
  await signInThroughUi(page, person);
  await synced(page);
  await context.setOffline(true);
  await add(page, "Tea");
  await page.getByRole("button", { name: "Edit Tea" }).click();
  await page.getByLabel("Name").fill("Green tea");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(item(page, "Green tea")).toBeVisible();
  await context.setOffline(false);
  await synced(page);
  const { data: rows } = await admin
    .from("list_items")
    .select("name, products(name)")
    .eq("household_id", house.id)
    .eq("name", "Green tea");
  expect(rows).toEqual([{ name: "Green tea", products: { name: "Green tea" } }]);
});

test("an item can carry a link that opens from the list", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Edit Garden hose" }).click();
  await page.getByLabel("Link").fill("not a link");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("doesn't look like a web address")).toBeVisible();
  await page.getByLabel("Link").fill("www.example.com/hose?size=20m");
  await page.getByRole("button", { name: "Save" }).click();
  const link = item(page, "Garden hose").getByRole("link", { name: "Open link for Garden hose" });
  await expect(link).toHaveAttribute("href", "https://www.example.com/hose?size=20m");
  await expect(link).toHaveAttribute("target", "_blank");
  await synced(page);
  const { data } = await admin.from("list_items").select("link").eq("household_id", house.id).eq("name", "Garden hose").single();
  expect(data?.link).toBe("https://www.example.com/hose?size=20m");
});

test("a list can be shared as text, downloaded as a spreadsheet and printed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInThroughUi(page, person);
  await add(page, "2 milk");
  await page.getByRole("button", { name: "Lists" }).click();

  // Share: phones use the share menu; here it falls back to copying.
  await page.getByRole("button", { name: /Share/ }).click();
  await expect(page.getByText("List copied")).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("Groceries");
  expect(text).toContain("• Milk (×2)");
  expect(text).toContain("https://www.example.com/hose?size=20m");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Spreadsheet/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^Groceries \d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await (await download.createReadStream()).toArray()).join("");
  expect(csv).toContain("List,Item,Quantity,Unit,Note,Link,Aisle,Added by,In the trolley,Added on");
  expect(csv).toContain("Groceries,Milk,2,,,,Dairy & Eggs,Ext,No,");

  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: /Print/ }).click()]);
  await popup.waitForLoadState();
  await expect(popup.locator("h1")).toContainText("Groceries");
  await expect(popup.locator("body")).toContainText("Milk");
});
