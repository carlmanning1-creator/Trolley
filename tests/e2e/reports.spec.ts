import { expect, test } from "@playwright/test";
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
let boss: TestPerson;
let member: TestPerson;

test.beforeAll(async () => {
  house = await createTestHousehold();
  boss = await createTestPerson("Boss", house.id);
  member = await createTestPerson("Member", house.id);
  await admin.from("profiles").update({ is_admin: true }).eq("id", boss.id).throwOnError();
});
test.afterAll(async () => {
  const { data: files } = await admin.storage.from("problem-reports").list(house.id);
  if (files?.length) await admin.storage.from("problem-reports").remove(files.map((f) => `${house.id}/${f.name}`));
  await removeTestPerson(boss);
  await removeTestPerson(member);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

// A tiny valid PNG to stand in for a screenshot.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("anyone can report a problem with a screenshot; the error log goes along without secrets", async ({ page }) => {
  await signInThroughUi(page, member);
  await expect(page.getByLabel("Add an item")).toBeVisible();
  await page.evaluate(() => console.error("Test failure while syncing", "Bearer abc.def.ghi"));

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Problem reports" })).toHaveCount(0);
  await page.getByLabel(/What happened/).fill("The milk came back after I ticked it");
  await page.getByLabel("Screenshot for the report").setInputFiles({ name: "screen.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "What else gets sent?" }).click();
  const details = page.locator("pre");
  await expect(details).toContainText("Test failure while syncing");
  await expect(details).toContainText("Bearer [hidden]");
  await expect(details).not.toContainText("abc.def.ghi");

  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks. The report has been sent.")).toBeVisible({ timeout: 20_000 });

  const { data } = await admin.from("problem_reports").select("message, screenshot_path, diagnostics, reported_by").eq("household_id", house.id).single();
  expect(data).toMatchObject({ message: "The milk came back after I ticked it", reported_by: member.id });
  expect(data!.screenshot_path).toMatch(new RegExp(`^${house.id}/`));
  expect(JSON.stringify(data!.diagnostics)).toContain("Test failure while syncing");
  expect(JSON.stringify(data!.diagnostics)).not.toContain("abc.def.ghi");
});

test("only the admin can read reports, and can mark them fixed", async ({ page, request }) => {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: member.email });
  const { createClient } = await import("@supabase/supabase-js");
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const v = await c.auth.verifyOtp({ email: member.email, token: link.data.properties!.email_otp, type: "email" });
  const denied = await request.get("/api/reports", { headers: { Authorization: `Bearer ${v.data.session!.access_token}` } });
  expect(denied.status()).toBe(403);

  await signInThroughUi(page, boss);
  await page.getByRole("button", { name: "Settings" }).click();
  const report = page.getByTestId("problem-report");
  await expect(report).toContainText("The milk came back after I ticked it");
  await expect(report).toContainText("Member");
  await expect(report.getByRole("link", { name: "View screenshot" })).toHaveAttribute("href", /problem-reports/);
  await report.getByRole("button", { name: "Mark fixed" }).click();
  await expect(page.getByText("No open reports.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show 1 fixed" })).toBeVisible();
  const { data } = await admin.from("problem_reports").select("status").eq("household_id", house.id).single();
  expect(data?.status).toBe("fixed");
});
