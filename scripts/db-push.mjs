#!/usr/bin/env node
// Applies pending SQL files in supabase/migrations through the Supabase Management API.
// Records each one in supabase_migrations.schema_migrations, the same table the Supabase CLI uses,
// so `supabase db push` and this script agree on what has run.
//
// Needs: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF first.");
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

const quote = (s) => `'${s.replaceAll("'", "''")}'`;

await sql(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);

const applied = new Set(
  (await sql("select version from supabase_migrations.schema_migrations")).map((r) => r.version),
);

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

let count = 0;
for (const file of files) {
  const match = file.match(/^(\d+)_(.+)\.sql$/);
  if (!match) continue;
  const [, version, name] = match;
  if (applied.has(version)) continue;
  const body = await readFile(path.join(dir, file), "utf8");
  process.stdout.write(`Applying ${file} ... `);
  await sql(`begin;
${body}
;
insert into supabase_migrations.schema_migrations (version, name, statements)
values (${quote(version)}, ${quote(name)}, array[${quote(body)}]);
commit;`);
  console.log("done");
  count++;
}
console.log(count ? `Applied ${count} migration(s).` : "Database is up to date.");
