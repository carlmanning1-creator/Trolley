"use client";

import { groupItems } from "@/components/ListView";
import { formatQuantity } from "@/lib/parse";
import type { AisleRow, ListItemRow, ListRow, ProfileRow } from "@/lib/types";

type Data = { list: ListRow; items: ListItemRow[]; aisles: AisleRow[]; profiles: Map<string, ProfileRow> };

const line = (i: ListItemRow) => {
  const qty = formatQuantity(i.quantity, i.unit);
  return [i.name, qty && `(${qty})`, i.note && `- ${i.note}`, i.link].filter(Boolean).join(" ");
};

// Plain text for sharing: still-to-buy items grouped by aisle, then what's already in the trolley.
export function listAsText({ list, items, aisles }: Data): string {
  const out: string[] = [`${list.icon} ${list.name}`];
  const groups = groupItems(items, aisles, list.use_aisles);
  if (groups.length === 0) out.push("", "Nothing left to buy.");
  for (const g of groups) {
    out.push("");
    if (g.title) out.push(g.title.toUpperCase());
    for (const i of g.items) out.push(`• ${line(i)}`);
  }
  const ticked = items.filter((i) => i.checked);
  if (ticked.length) {
    out.push("", "IN THE TROLLEY");
    for (const i of ticked) out.push(`✓ ${line(i)}`);
  }
  return out.join("\n");
}

export async function shareList(data: Data): Promise<"shared" | "copied"> {
  const text = listAsText(data);
  if (navigator.share) {
    try {
      await navigator.share({ title: data.list.name, text });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared"; // they closed the share menu
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything that needs it, and stop spreadsheets treating text as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function listAsCsv({ list, items, aisles, profiles }: Data): string {
  const aisleName = new Map(aisles.map((a) => [a.id, a.name]));
  const order = new Map(aisles.map((a, i) => [a.id, i]));
  const rows = [...items].sort(
    (a, b) =>
      Number(a.checked) - Number(b.checked) ||
      (order.get(a.aisle_id ?? "") ?? 999) - (order.get(b.aisle_id ?? "") ?? 999) ||
      a.name.localeCompare(b.name),
  );
  const header = ["List", "Item", "Quantity", "Unit", "Note", "Link", "Aisle", "Added by", "In the trolley", "Added on"];
  const lines = [header.join(",")];
  for (const i of rows) {
    lines.push(
      [
        list.name,
        i.name,
        i.quantity,
        i.unit,
        i.note,
        i.link,
        i.aisle_id ? aisleName.get(i.aisle_id) : "",
        i.added_by ? profiles.get(i.added_by)?.display_name : "",
        i.checked ? "Yes" : "No",
        i.created_at.slice(0, 10),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function downloadCsv(data: Data) {
  // The byte-order mark makes Excel read the emoji and accents correctly.
  const blob = new Blob(["﻿", listAsCsv(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.list.name.replace(/[^\w -]+/g, "").trim() || "list"} ${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function listAsPrintHtml({ list, items, aisles }: Data): string {
  const groups = groupItems(items, aisles, list.use_aisles);
  const body = groups
    .map(
      (g) =>
        `${g.title ? `<h2>${esc(g.title)}</h2>` : ""}<ul>${g.items
          .map((i) => {
            const qty = formatQuantity(i.quantity, i.unit);
            return `<li><span class="box"></span><span><strong>${esc(i.name)}</strong>${qty ? ` ${esc(qty)}` : ""}${
              i.note ? `<br><em>${esc(i.note)}</em>` : ""
            }</span></li>`;
          })
          .join("")}</ul>`,
    )
    .join("");
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${esc(list.name)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#111}
  h1{font-size:24px;margin:0 0 4px} .date{color:#555;margin:0 0 16px}
  .cols{columns:2;column-gap:32px} h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#444;margin:14px 0 6px;break-after:avoid}
  ul{list-style:none;padding:0;margin:0} li{display:flex;gap:10px;align-items:flex-start;padding:4px 0;break-inside:avoid;font-size:15px}
  .box{width:14px;height:14px;border:1.5px solid #333;border-radius:3px;margin-top:3px;flex:none}
  em{color:#555;font-size:13px} @media print{body{margin:12mm}}
</style></head><body>
<h1>${esc(list.icon)} ${esc(list.name)}</h1><p class="date">${esc(new Date().toLocaleDateString("en-AU", { dateStyle: "full" }))}</p>
<div class="cols">${body || "<p>Nothing left to buy.</p>"}</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},200)})</script>
</body></html>`;
}

export function printList(data: Data) {
  const blob = new Blob([listAsPrintHtml(data)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // Pop-ups blocked (common in installed apps): print from a hidden frame instead.
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = url;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 60_000);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
