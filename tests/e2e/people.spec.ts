import AxeBuilder from "@axe-core/playwright";
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
const added: string[] = [];

test.beforeAll(async () => {
  house = await createTestHousehold();
  boss = await createTestPerson("Boss", house.id);
  member = await createTestPerson("Member", house.id);
  await admin.from("profiles").update({ is_admin: true }).eq("id", boss.id).throwOnError();
});
test.afterAll(async () => {
  for (const email of added) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = data?.users.find((x) => x.email === email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
  await removeTestPerson(boss);
  await removeTestPerson(member).catch(() => undefined);
  await removeTestHousehold(house);
});

test.describe.configure({ mode: "serial" });

async function openSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("only the household admin sees People, and the server agrees", async ({ page, request }) => {
  await signInThroughUi(page, member);
  await openSettings(page);
  await expect(page.getByRole("heading", { name: "Lists" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People" })).toHaveCount(0);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: member.email });
  const { createClient } = await import("@supabase/supabase-js");
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const v = await c.auth.verifyOtp({ email: member.email, token: link.data.properties!.email_otp, type: "email" });
  const token = v.data.session!.access_token;
  expect(token).not.toBe("");
  const res = await request.post("/api/people", {
    headers: { Authorization: `Bearer ${token}` },
    data: { displayName: "Sneaky", email: "sneaky@trolley.test" },
  });
  expect(res.status()).toBe(403);
  const anon = await request.get("/api/people");
  expect(anon.status()).toBe(401);
});

test("the admin adds someone, who can then sign in to the same household", async ({ page, browser }) => {
  const email = `e2e-newbie-${Date.now()}@trolley.test`;
  added.push(email);
  await signInThroughUi(page, boss);
  await openSettings(page);
  const people = page.getByRole("list", { name: "People in your household" });
  await expect(people.getByText("Boss (you)")).toBeVisible();
  await expect(people.getByText("Member", { exact: true })).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${scheme}: ${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  }

  await page.getByLabel("Their name").fill("Newbie");
  await page.getByLabel("Their email").fill(email);
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText(`Newbie is in. Tell them to open Trolley and sign in with ${email}.`)).toBeVisible();
  await expect(people.getByText(email)).toBeVisible();

  // Adding the same email twice is refused.
  await page.getByLabel("Their name").fill("Newbie again");
  await page.getByLabel("Their email").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText("That email is already in your household.")).toBeVisible();

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const newbieId = users.users.find((u) => u.email === email)!.id;
  const { data: profile } = await admin.from("profiles").select("household_id, display_name, is_admin").eq("id", newbieId).single();
  expect(profile).toEqual({ household_id: house.id, display_name: "Newbie", is_admin: false });

  const ctx = await browser.newContext();
  const newbiePage = await ctx.newPage();
  await signInThroughUi(newbiePage, { id: newbieId, email, name: "Newbie" });
  await expect(newbiePage.getByLabel("Add an item")).toBeVisible();
  await ctx.close();
});

test("removing someone signs them out of the household on their phone", async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const memberPage = await ctx.newPage();
  await signInThroughUi(memberPage, member);
  await expect(memberPage.getByLabel("Add an item")).toBeVisible();

  await signInThroughUi(page, boss);
  await openSettings(page);
  await expect(page.getByRole("button", { name: "Remove Boss" })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Member" }).click();
  await page.getByRole("button", { name: "Remove Member", exact: true }).last().click();
  await expect(page.getByText("Member has been removed and signed out.")).toBeVisible();
  await expect(page.getByRole("list", { name: "People in your household" }).getByText("Member", { exact: true })).toHaveCount(0);

  const { data } = await admin.auth.admin.getUserById(member.id);
  expect(data.user).toBeNull();

  await memberPage.reload();
  await expect(memberPage.getByText("This account isn't part of a household.")).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});
