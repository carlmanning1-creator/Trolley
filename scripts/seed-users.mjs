#!/usr/bin/env node
// Creates the household's sign-in accounts and profiles. Safe to run again: existing people are kept.
// Day to day, the household admin (Carl) adds and removes people in Settings, People.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (reads .env.local).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const HOUSEHOLD_ID = "6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01";
const PEOPLE = [
  { email: "carlmanning1@gmail.com", display_name: "Carl", colour: "#2563eb", is_admin: true },
  { email: "rebecca.manning1983@gmail.com", display_name: "Bec", colour: "#db2777" },
  { email: "gracegarretty@hotmail.com", display_name: "Grace", colour: "#7c3aed" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

for (const person of PEOPLE) {
  const email = person.email.toLowerCase();
  let id = await findUserId(email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    id = data.user.id;
    console.log(`Created account for ${person.display_name}`);
  } else {
    console.log(`${person.display_name} already has an account`);
  }

  const { error } = await admin.from("profiles").upsert(
    {
      id,
      household_id: HOUSEHOLD_ID,
      display_name: person.display_name,
      colour: person.colour,
      is_admin: person.is_admin ?? false,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw error;
}
console.log("Household people are ready.");
