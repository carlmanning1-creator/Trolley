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
import { receiptPhoto } from "./receipt-fixture";

let house: TestHousehold;
let person: TestPerson;

test.beforeAll(async () => {
  house = await createTestHousehold();
  person = await createTestPerson("Rec", house.id);
});
test.afterAll(async () => {
  const { data: files } = await admin.storage.from("receipts").list(house.id);
  if (files?.length) await admin.storage.from("receipts").remove(files.map((f) => `${house.id}/${f.name}`));
  await removeTestPerson(person);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

const item = (page: Page, name: string) => page.locator(`[data-testid="list-item"][data-name="${name}"]`);
async function add(page: Page, text: string) {
  await page.getByLabel("Add an item").fill(text);
  await page.getByLabel("Add an item").press("Enter");
}

test("a photographed Woolworths receipt ticks off the matching items after review", async ({ page }) => {
  await signInThroughUi(page, person);
  for (const t of ["Milk", "Bananas", "Bread", "Eggs"]) await add(page, t);
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });

  await page.getByRole("button", { name: "Receipts" }).click();
  await page.getByLabel("Upload a receipt photo").setInputFiles({
    name: "receipt.jpg",
    mimeType: "image/jpeg",
    buffer: await receiptPhoto(),
  });

  // Review screen: milk, bananas and bread matched; eggs still to buy; fly spray and Tim Tams not on the list.
  await expect(page.getByRole("heading", { name: /Ticks these off/ })).toBeVisible({ timeout: 90_000 });
  const matched = page.getByRole("region", { name: "Matched", exact: true });
  await expect(matched.getByLabel(/List item for .*MLK/)).toHaveValue(/.+/);
  const chosen = await matched.locator("select").evaluateAll((els) =>
    els.map((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent ?? ""),
  );
  expect(chosen.sort()).toEqual(["Bananas", "Bread", "Milk"]);
  await expect(page.getByRole("region", { name: "Still to buy" })).toContainText("Eggs");
  await expect(page.getByRole("region", { name: "Not matched" })).toContainText(/MORTEIN/);

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("3 items ticked off")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();

  await page.getByRole("button", { name: /In the trolley \(3\)/ }).click();
  for (const n of ["Milk", "Bananas", "Bread"]) await expect(item(page, n)).toHaveAttribute("data-checked", "true");
  await expect(item(page, "Eggs")).toHaveAttribute("data-checked", "false");

  // Prices kept for spend tracking; purchases counted on products.
  const { data: receipt } = await admin
    .from("receipts")
    .select("id, status, store_name, total, purchased_at")
    .eq("household_id", house.id)
    .single();
  expect(receipt).toMatchObject({ status: "confirmed", total: 19.35 });
  expect(receipt!.store_name).toMatch(/woolworths/i);
  expect(receipt!.purchased_at).toContain("2026-09-24");
  const { data: lines } = await admin.from("receipt_lines").select("description, line_total, list_item_id").eq("receipt_id", receipt!.id);
  expect(lines!.length).toBeGreaterThanOrEqual(5);
  expect(lines!.map((l) => Number(l.line_total)).reduce((a, b) => a + b, 0)).toBeCloseTo(19.35, 2);
  const { data: milk } = await admin.from("products").select("times_bought, last_bought_at").eq("household_id", house.id).eq("name", "Milk").single();
  expect(milk!.times_bought).toBe(1);
});

test("a photo that isn't a receipt fails with a friendly message", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Receipts" }).click();
  const sharp = (await import("sharp")).default;
  const blank = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3b82f6" } }).jpeg().toBuffer();
  await page.getByLabel("Upload a receipt photo").setInputFiles({ name: "sky.jpg", mimeType: "image/jpeg", buffer: blank });
  await expect(page.getByText(/doesn't look like a shopping receipt|couldn't read that receipt/i).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-testid="receipt-row"][data-status="failed"]')).toBeVisible();
});

test("a receipt photographed with no signal waits, then gets read when signal returns", async ({ page, context }) => {
  await signInThroughUi(page, person);
  await add(page, "Milk");
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
  await page.getByRole("button", { name: "Receipts" }).click();
  await context.setOffline(true);
  await page.getByLabel("Upload a receipt photo").setInputFiles({
    name: "receipt.jpg",
    mimeType: "image/jpeg",
    buffer: await receiptPhoto(),
  });
  await expect(page.getByText("Waiting for signal")).toBeVisible();
  await expect(page.getByText("It will be read when there's signal")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: /Ticks these off/ })).toBeVisible({ timeout: 90_000 });
});
