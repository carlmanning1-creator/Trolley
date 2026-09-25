"use client";

import { Sheet } from "@/components/Sheet";
import { downloadCsv, printList, shareList } from "@/lib/exportList";
import type { AisleRow, ListItemRow, ListRow, ProfileRow } from "@/lib/types";

const exportButton = "min-h-12 rounded-xl border border-border px-2 text-sm font-medium";

// Switch lists, export the current one, or jump to Settings to manage them.
export function ListsSheet({
  open,
  onClose,
  lists,
  active,
  items,
  aisles,
  profiles,
  onPick,
  onManage,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  lists: ListRow[];
  active: ListRow;
  items: ListItemRow[];
  aisles: AisleRow[];
  profiles: Map<string, ProfileRow>;
  onPick: (id: string) => void;
  onManage: () => void;
  onToast: (message: string) => void;
}) {
  const data = { list: active, items, aisles, profiles };
  return (
    <Sheet open={open} onClose={onClose} title="Lists">
      <div className="flex flex-col gap-2">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              onPick(l.id);
              onClose();
            }}
            aria-current={l.id === active.id ? "page" : undefined}
            className={`min-h-14 rounded-xl px-4 text-left text-lg font-medium ${
              l.id === active.id ? "bg-brand text-brand-contrast" : "bg-surface-2"
            }`}
          >
            {l.icon} {l.name}
          </button>
        ))}
        <div className="flex flex-col gap-3 pt-2">
          <div>
            <p className="mb-2 font-semibold">
              Export {active.icon} {active.name}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={async () => {
                  if ((await shareList(data)) === "copied") onToast("List copied. Paste it anywhere.");
                }}
                className={exportButton}
              >
                📤 Share
              </button>
              <button type="button" onClick={() => downloadCsv(data)} className={exportButton}>
                📊 Spreadsheet
              </button>
              <button type="button" onClick={() => printList(data)} className={exportButton}>
                🖨️ Print
              </button>
            </div>
          </div>
          <button type="button" onClick={onManage} className="min-h-12 w-full rounded-xl border border-border font-medium">
            Add, rename or reorder lists
          </button>
        </div>
      </div>
    </Sheet>
  );
}
