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

// A temporary person. By default in the Manning household (read-only checks only);
// tests that change lists use their own throwaway household from createTestHousehold.
export async function createTestPerson(name: string, householdId = MANNING): Promise<TestPerson> {
  const email = `e2e-${name.toLowerCase()}-${randomUUID().slice(0, 8)}@trolley.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  await admin
    .from("profiles")
    .insert({ id: data.user.id, household_id: householdId, display_name: name, colour: "#0891b2" })
    .throwOnError();
  return { id: data.user.id, email, name };
}

export type TestHousehold = { id: string; groceriesId: string; hardwareId: string; aisles: Record<string, string> };

// A throwaway household with two lists and a few aisles, so tests never touch the family's lists.
export async function createTestHousehold(): Promise<TestHousehold> {
  const id = randomUUID();
  await admin.from("households").insert({ id, name: "E2E household" }).throwOnError();
  const groceriesId = randomUUID();
  const hardwareId = randomUUID();
  await admin
    .from("lists")
    .insert([
      { id: groceriesId, household_id: id, name: "Groceries", icon: "🛒", sort_order: 1, use_aisles: true },
      { id: hardwareId, household_id: id, name: "Bunnings", icon: "🔨", sort_order: 2, use_aisles: false },
    ])
    .throwOnError();
  const names = ["Fruit & Veg", "Bakery", "Dairy & Eggs", "Pantry", "Other"];
  const aisles: Record<string, string> = {};
  const rows = names.map((name, i) => {
    const aid = randomUUID();
    aisles[name] = aid;
    return { id: aid, household_id: id, name, icon: "🛒", sort_order: i + 1 };
  });
  await admin.from("aisles").insert(rows).throwOnError();
  return { id, groceriesId, hardwareId, aisles };
}

export async function removeTestHousehold(h: TestHousehold) {
  await admin.from("households").delete().eq("id", h.id);
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

// Some sandboxed test machines block browser WebSockets entirely. Live-push checks are skipped
// there; tests/integration/realtime.test.ts proves the same thing outside the browser.
export async function browserWebSocketsWork(page: Page): Promise<boolean> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace("https://", "wss://")}/realtime/v1/websocket?apikey=${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}&vsn=2.0.0`;
  return page.evaluate(
    (u) =>
      new Promise<boolean>((resolve) => {
        const ws = new WebSocket(u);
        ws.onopen = () => {
          ws.close();
          resolve(true);
        };
        ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 8000);
      }),
    url,
  );
}

// What the app does when someone switches back to it: push anything waiting, then catch up.
export async function refocus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
