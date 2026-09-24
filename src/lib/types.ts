// Row shapes shared by the local store and Supabase. Timestamps are ISO strings.

type Stamps = {
  created_at: string;
  updated_at: string;
  synced_at?: string;
};

export type Household = Stamps & { id: string; name: string };

export type ProfileRow = Stamps & {
  id: string;
  household_id: string;
  display_name: string;
  colour: string;
  is_admin?: boolean;
};

export type ListRow = Stamps & {
  id: string;
  household_id: string;
  name: string;
  icon: string;
  sort_order: number;
  use_aisles: boolean;
  deleted_at: string | null;
};

export type AisleRow = Stamps & {
  id: string;
  household_id: string;
  name: string;
  icon: string;
  sort_order: number;
  deleted_at: string | null;
};

export type ImageSource = "off" | "photo" | "upload" | "none" | "commons" | "web";

export type ProductRow = Stamps & {
  id: string;
  household_id: string;
  name: string;
  barcode: string | null;
  aisle_id: string | null;
  image_path: string | null;
  image_source: ImageSource;
  off_code: string | null;
  is_staple: boolean;
  default_quantity: number | null;
  default_unit: string | null;
  times_bought: number;
  last_bought_at: string | null;
  deleted_at: string | null;
};

export type ListItemRow = Stamps & {
  id: string;
  household_id: string;
  list_id: string;
  product_id: string | null;
  aisle_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  link: string | null;
  distinct_from?: string[];
  added_by: string | null;
  checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  check_changed_at: string | null;
  deleted_at: string | null;
};

export type ShoppingSessionRow = Stamps & {
  id: string;
  household_id: string;
  list_id: string;
  started_by: string | null;
  started_at: string;
  ended_at: string | null;
};

// Tables mirrored on the device, in the order the outbox must push them
// (a list item can only reach the server after its list, aisle and product).
// Aisles come before lists so that by the time a list shows on a new device, new items can be sorted.
export const SYNCED_TABLES = [
  "profiles",
  "aisles",
  "lists",
  "products",
  "list_items",
  "shopping_sessions",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export type RowFor<T extends SyncedTable> = T extends "profiles"
  ? ProfileRow
  : T extends "lists"
    ? ListRow
    : T extends "aisles"
      ? AisleRow
      : T extends "products"
        ? ProductRow
        : T extends "list_items"
          ? ListItemRow
          : ShoppingSessionRow;

export type AnyRow = ProfileRow | ListRow | AisleRow | ProductRow | ListItemRow | ShoppingSessionRow;
