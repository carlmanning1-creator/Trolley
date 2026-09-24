import { expect, test } from "@playwright/test";
import { createTestPerson, removeTestPerson, signInThroughUi, type TestPerson } from "./helpers";

let person: TestPerson;

test.beforeAll(async () => {
  person = await createTestPerson("Tester");
});
test.afterAll(async () => {
  await removeTestPerson(person);
});

test("signs in with a 6-digit code and stays signed in after reload", async ({ page }) => {
  await signInThroughUi(page, person);
  await expect(page.getByText("Tester", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Tester", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
});

test("refuses an email that is not in the household", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@trolley.test`);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn't on the household list");
});

test("a wrong code is rejected", async ({ page }) => {
  await page.route("**/auth/v1/otp**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  await page.getByLabel("Email").fill(person.email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("didn't work");
});
