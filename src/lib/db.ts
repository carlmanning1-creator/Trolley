import Dexie, { type EntityTable } from "dexie";
import type {
  AisleRow,
  ListItemRow,
  ListRow,
  ProductRow,
  ProfileRow,
  ShoppingSessionRow,
  SyncedTable,
} from "@/lib/types";

// One pending change waiting to reach the server. The row itself is read from the local
// table at push time, so several quick edits to one item go up as a single write.
export type OutboxEntry = {
  seq?: number;
  table: SyncedTable;
  row_id: string;
  queued_at: string;
  attempts: number;
};

export type MetaEntry = { key: string; value: string };

// Product pictures kept on the device so they show with no signal.
export type ImageEntry = { path: string; blob: Blob; saved_at: string };

// A picture taken on this device that still has to be uploaded (kept until there's signal).
export type UploadEntry = { path: string; bucket: string; content_type: string; queued_at: string };

// A receipt photo taken with no signal, kept until it can be uploaded and read.
export type PendingReceipt = { id: string; list_id: string; blob: Blob; queued_at: string; error?: string };

export class TrolleyDB extends Dexie {
  profiles!: EntityTable<ProfileRow, "id">;
  lists!: EntityTable<ListRow, "id">;
  aisles!: EntityTable<AisleRow, "id">;
  products!: EntityTable<ProductRow, "id">;
  list_items!: EntityTable<ListItemRow, "id">;
  shopping_sessions!: EntityTable<ShoppingSessionRow, "id">;
  outbox!: EntityTable<OutboxEntry, "seq">;
  meta!: EntityTable<MetaEntry, "key">;
  images!: EntityTable<ImageEntry, "path">;
  uploads!: EntityTable<UploadEntry, "path">;
  pending_receipts!: EntityTable<PendingReceipt, "id">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      profiles: "id",
      lists: "id, sort_order",
      aisles: "id, sort_order",
      products: "id, barcode, is_staple, last_bought_at",
      list_items: "id, list_id, product_id",
      shopping_sessions: "id, list_id, ended_at",
      outbox: "++seq, [table+row_id]",
      meta: "key",
      images: "path",
    });
    this.version(2).stores({ uploads: "path" });
    this.version(3).stores({ pending_receipts: "id" });
  }
}

// A separate local database per signed-in person, so switching accounts on a shared
// device (like the kitchen screen) never mixes up queued changes.
let current: { userId: string; db: TrolleyDB } | null = null;

export function openDb(userId: string): TrolleyDB {
  if (current?.userId === userId) return current.db;
  current?.db.close();
  const db = new TrolleyDB(`trolley-${userId}`);
  current = { userId, db };
  return db;
}

export function db(): TrolleyDB {
  if (!current) throw new Error("Local database used before sign-in");
  return current.db;
}

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db().meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db().meta.put({ key, value });
}
