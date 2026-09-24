import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

config({ path: ".env.local", quiet: true });

export const MANNING = "6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01";

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export type TestPerson = { id: string; email: string; name: string };

// A temporary member of the Manning household. Remove with removeTestPerson.
export async function createTestPerson(name: string): Promise<TestPerson> {
  const email = `e2e-${name.toLowerCase()}-${randomUUID().slice(0, 8)}@trolley.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  await admin
    .from("profiles")
    .insert({ id: data.user.id, household_id: MANNING, display_name: name, colour: "#0891b2" })
    .throwOnError();
  return { id: data.user.id, email, name };
}

export async function removeTestPerson(p: TestPerson) {
  await admin.auth.admin.deleteUser(p.id);
}

// Signs in through the real screens. The "send code" request is intercepted so no email goes out,
// and the code comes from the admin API instead of an inbox.
export async function signInThroughUi(page: Page, person: TestPerson) {
  await page.route("**/auth/v1/otp**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  await page.getByLabel("Email").fill(person.email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: person.email });
  if (error) throw error;
  await page.getByLabel("6-digit code").fill(data.properties.email_otp);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.unroute("**/auth/v1/otp**");
}
