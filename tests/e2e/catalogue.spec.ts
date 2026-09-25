import { expect, test, type Page } from "@playwright/test";
import {
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
  person = await createTestPerson("Cat", house.id);
});
test.afterAll(async () => {
  await removeTestPerson(person);
  await removeTestHousehold(house);
});

const item = (page: Page, name: string) => page.locator(`[data-testid="list-item"][data-name="${name}"]`);
async function add(page: Page, text: string) {
  await page.getByLabel("Add an item").fill(text);
  await page.getByLabel("Add an item").press("Enter");
}

test.describe.configure({ mode: "serial" });

test("unknown items get sorted into an aisle by the AI fallback", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Gochujang");
  await expect(page.getByRole("region", { name: "Pantry" }).locator('[data-name="Gochujang"]')).toBeVisible({
    timeout: 20_000,
  });
});

test("staples: mark, one-tap add, greyed when on the list; recent shows bought items", async ({ page }) => {
  await signInThroughUi(page, person);
  await add(page, "Milk");
  await page.getByRole("button", { name: "Edit Milk" }).click();
  await page.getByText("More: link, aisle, picture, staple").click();
  await page.getByLabel(/Staple/).click();
  await expect(page.getByLabel(/Staple/)).toBeChecked();
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Staples" }).click();
  const staple = page.locator('[data-testid="staple-row"][data-name="Milk"]');
  await expect(staple.getByRole("button", { name: "Milk is already on the list" })).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();

  // Buy it and clear it
  await item(page, "Milk").getByRole("checkbox").click();
  await page.getByRole("button", { name: "Clear ticked items" }).click();
  await expect(item(page, "Milk")).toHaveCount(0);

  // One tap puts it back
  await page.getByRole("button", { name: "Staples" }).click();
  await staple.getByRole("button", { name: "Add Milk" }).click();
  await expect(staple.getByRole("button", { name: "Milk is already on the list" })).toBeVisible();

  // Recent shows it with how often it was bought
  await page.getByRole("tab", { name: /Recent/ }).click();
  await expect(page.locator('[data-testid="staple-row"][data-name="Milk"]')).toContainText("×1");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();
  await expect(item(page, "Milk")).toBeVisible();
});

test("typing shows catalogue suggestions and a tap adds", async ({ page }) => {
  await signInThroughUi(page, person);
  await page.getByLabel("Add an item").fill("goch");
  await page.getByRole("listbox", { name: "Suggestions" }).getByRole("button", { name: /Gochujang/ }).click();
  await expect(page.getByText("Gochujang is already on the list")).toBeVisible();
});
