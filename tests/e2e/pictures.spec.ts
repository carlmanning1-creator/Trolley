import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
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
  person = await createTestPerson("Pic", house.id);
});
test.afterAll(async () => {
  const { data: files } = await admin.storage.from("product-images").list(house.id);
  if (files?.length) await admin.storage.from("product-images").remove(files.map((f) => `${house.id}/${f.name}`));
  await removeTestPerson(person);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

const item = (page: Page, name: string) => page.locator(`[data-testid="list-item"][data-name="${name}"]`);
const UNKNOWN = "2912345678904";

async function product(name: string) {
  const { data } = await admin
    .from("products")
    .select("name, barcode, image_path, image_source, aisle_id")
    .eq("household_id", house.id)
    .eq("name", name)
    .maybeSingle();
  return data;
}

test("scanning a real barcode with the camera adds it with its picture and aisle", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByLabel("Camera viewfinder")).toBeVisible();
  // The fake camera shows the Vegemite barcode; Open Food Facts knows it.
  await expect(page.getByText("Barcode 9300650658615")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Name")).toHaveValue(/Vegemite/i);
  await page.getByRole("button", { name: "Add to list" }).click();

  const row = page.locator('[data-testid="list-item"]').filter({ hasText: /Vegemite/i });
  await expect(row).toBeVisible();
  await expect(page.getByRole("region", { name: "Pantry" })).toContainText(/Vegemite/i);
  await expect(row.locator("img").first()).toBeVisible({ timeout: 45_000 });

  await expect.poll(async () => (await admin.from("products").select("image_source, image_path, barcode").eq("household_id", house.id).ilike("name", "%vegemite%").single()).data, { timeout: 20_000 }).toMatchObject({ image_source: "off", barcode: "9300650658615" });
  const { data: files } = await admin.storage.from("product-images").list(house.id);
  expect(files?.some((f) => /-off(-\d+)?\.(jpg|png|webp)$/.test(f.name))).toBe(true);
});

test("scanning it again comes straight from the catalogue", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByText("Barcode 9300650658615")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Name")).toHaveCount(0); // catalogue card, not the Open Food Facts form
  await page.getByRole("button", { name: "Add to list" }).click();
  await expect(page.getByText(/is already on the list/)).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
});

test("an unknown barcode gets named once and is known next time", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByLabel("Barcode number").fill(UNKNOWN);
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Name it once")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("What is it?").fill("Mystery sauce");
  await page.getByRole("button", { name: "Add to list" }).click();
  await expect(item(page, "Mystery sauce")).toBeVisible();

  await item(page, "Mystery sauce").getByRole("checkbox").click();
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByLabel("Barcode number").fill(UNKNOWN);
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Mystery sauce")).toBeVisible();
  await page.getByRole("button", { name: "Add to list" }).click();
  await expect(item(page, "Mystery sauce")).toHaveAttribute("data-checked", "false");
  await expect.poll(async () => (await product("Mystery sauce"))?.barcode, { timeout: 15_000 }).toBe(UNKNOWN);
  // Let this phone finish syncing before the test closes it.
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
});

test("anyone can replace a picture with their own", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Edit Mystery sauce" }).click();
  await page.getByText("More: link, aisle, picture, staple").click();
  const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#d97706" } })
    .jpeg()
    .toBuffer();
  await page.getByLabel("Upload a picture").setInputFiles({ name: "sauce.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByText("Picture saved")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(item(page, "Mystery sauce").locator("img")).toBeVisible();

  await expect.poll(async () => (await product("Mystery sauce"))?.image_source, { timeout: 15_000 }).toBe("upload");
  const path = (await product("Mystery sauce"))!.image_path!;
  // Uploaded, and resized on the phone to at most 800px.
  await expect
    .poll(async () => (await admin.storage.from("product-images").download(path)).data !== null, { timeout: 15_000 })
    .toBe(true);
  const { data } = await admin.storage.from("product-images").download(path);
  const meta = await sharp(Buffer.from(await data!.arrayBuffer())).metadata();
  expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(800);
});

test("typed items get a picture from Open Food Facts when one exists", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByLabel("Add an item").fill("Weet-Bix");
  await page.getByLabel("Add an item").press("Enter");
  // Allow for Open Food Facts being slow: the background retry fills it in if the first try fails.
  await expect(item(page, "Weet-Bix").locator("img")).toBeVisible({ timeout: 75_000 });
});

test("phones with a built-in barcode reader use it", async ({ page }) => {
  // Stand in for Android Chrome's reader: it "sees" a barcode on the third frame.
  await page.addInitScript(() => {
    let frames = 0;
    class FakeDetector {
      static async getSupportedFormats() {
        return ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];
      }
      async detect() {
        frames++;
        return frames >= 3 ? [{ rawValue: "9300601000013" }] : [];
      }
    }
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = FakeDetector;
  });
  await signInThroughUi(page, person);
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByText("Barcode 9300601000013")).toBeVisible({ timeout: 20_000 });
});
