import AxeBuilder from "@axe-core/playwright";
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
  person = await createTestPerson("Kit", house.id);
});
test.afterAll(async () => {
  await removeTestPerson(person);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

async function add(page: Page, text: string) {
  await page.getByLabel("Add an item").fill(text);
  await page.getByLabel("Add an item").press("Enter");
}

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`),
  ).toEqual([]);
}

test("main screens pass an accessibility check in light and dark mode", async ({ page }) => {
  await signInThroughUi(page, person);
  for (const t of ["2 milk", "bananas", "sourdough", "Pantry thing"]) await add(page, t);
  await page.locator('[data-name="Bananas"]').getByRole("checkbox").click();
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
  await expectAccessible(page, "list (light)");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectAccessible(page, "list (dark)");
  await page.emulateMedia({ colorScheme: "light" });

  await page.getByRole("button", { name: "Edit Milk" }).click();
  await expectAccessible(page, "item editor");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  await expectAccessible(page, "settings");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Staples" }).click();
  await expectAccessible(page, "staples");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Running low/ }).click();
  await expectAccessible(page, "running low");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Scan or review receipts/ }).click();
  await expectAccessible(page, "receipts");
});

test("the sign-in screen passes an accessibility check", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expectAccessible(page, "sign in");
  await ctx.close();
});

test("the kitchen screen shows Groceries full screen in big columns with add and scan", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: true });
  const page = await ctx.newPage();
  await signInThroughUi(page, person);
  await expect(page.getByLabel("Add an item")).toBeVisible();
  await page.goto("/kiosk");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Groceries");
  await expect(page.getByRole("button", { name: "Scan" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await add(page, "Kiosk apples");
  await expect(page.locator('[data-name="Kiosk apples"]')).toBeVisible();
  // Big touch targets and text for across the room.
  const box = await page.locator('[data-name="Kiosk apples"]').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(76);
  const fontSize = await page.locator('[data-name="Kiosk apples"]').evaluate(
    (el) => parseFloat(getComputedStyle(el.querySelector("span.block")!).fontSize),
  );
  expect(fontSize).toBeGreaterThanOrEqual(28);
  await expectAccessible(page, "kiosk");
  await page.screenshot({ path: "test-results/kiosk.png" });
  await ctx.close();
});
