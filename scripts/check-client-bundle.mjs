#!/usr/bin/env node
// Fails the build if a server-only secret (its name or its value) appears in any file sent to browsers.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const SERVER_ONLY = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "VAPID_PRIVATE_KEY"];
const roots = [".next/static", "public"];

const needles = [];
for (const name of SERVER_ONLY) {
  needles.push({ label: `the name ${name}`, text: name });
  const value = process.env[name];
  if (value && value.length >= 16) needles.push({ label: `the value of ${name}`, text: value });
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs|css|html|json|txt|map)$/.test(entry)) yield full;
  }
}

let problems = 0;
let scanned = 0;
for (const root of roots) {
  for await (const file of walk(root)) {
    scanned++;
    const body = await readFile(file, "utf8");
    for (const n of needles) {
      if (body.includes(n.text)) {
        console.error(`Secret leak: ${file} contains ${n.label}`);
        problems++;
      }
    }
  }
}

if (problems) {
  console.error(`Client bundle check failed with ${problems} problem(s).`);
  process.exit(1);
}
console.log(`Client bundle check passed (${scanned} files scanned).`);
