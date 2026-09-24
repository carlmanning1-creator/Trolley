-- Trolley core schema.
-- Every row uses a client-generated UUID so records can be created offline.
-- Every table carries household_id so row level security and realtime filters stay simple.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Timestamp helpers
-- ---------------------------------------------------------------------------

-- Clients send updated_at from their own clock so offline edits keep their real time.
-- Cap it at the server clock so a device with a fast clock cannot win every conflict.
create or replace function public.clamp_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is null or new.updated_at > now() then
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' and (new.created_at is null or new.created_at > now()) then
    new.created_at := now();
  end if;
  return new;
end;
$$;

-- Last write wins per row, judged by updated_at.
-- Applied to tables without special conflict rules.
create or replace function public.last_write_wins()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- incoming change is older than what we hold: skip it
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null,
  colour text not null default '#16a34a',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_household_idx on public.profiles (household_id);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  icon text not null default '🛒',
  sort_order double precision not null default 0,
  use_aisles boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, household_id)
);
create index lists_household_updated_idx on public.lists (household_id, updated_at);

create table public.aisles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  icon text not null default '🛒',
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, household_id)
);
create index aisles_household_updated_idx on public.aisles (household_id, updated_at);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  barcode text,
  aisle_id uuid,
  image_path text,
  image_source text not null default 'none'
    check (image_source in ('off', 'photo', 'upload', 'none')),
  off_code text,
  is_staple boolean not null default false,
  default_quantity numeric,
  default_unit text,
  times_bought integer not null default 0,
  last_bought_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (aisle_id, household_id) references public.aisles (id, household_id)
);
create index products_household_updated_idx on public.products (household_id, updated_at);
create index products_barcode_idx on public.products (household_id, barcode) where barcode is not null;
create index products_name_trgm_idx on public.products using gin (lower(name) extensions.gin_trgm_ops);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_id uuid not null,
  product_id uuid,
  aisle_id uuid,
  name text not null,
  quantity numeric,
  unit text,
  note text,
  added_by uuid references public.profiles (id) on delete set null default auth.uid(),
  checked boolean not null default false,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  -- When the tick state last changed (tick or untick). Drives the tick conflict rule.
  check_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (list_id, household_id) references public.lists (id, household_id) on delete cascade,
  foreign key (product_id, household_id) references public.products (id, household_id),
  foreign key (aisle_id, household_id) references public.aisles (id, household_id)
);
create index list_items_household_updated_idx on public.list_items (household_id, updated_at);
create index list_items_list_idx on public.list_items (list_id) where deleted_at is null;

-- list_items conflict rule:
--   * tick state: newest check_changed_at wins (a tick stays unless the untick is newer)
--   * every other field: newest updated_at wins
create or replace function public.list_items_merge()
returns trigger
language plpgsql
as $$
declare
  keep_old_check boolean;
  keep_old_rest boolean;
begin
  keep_old_check := old.check_changed_at is not null
    and (new.check_changed_at is null or new.check_changed_at < old.check_changed_at);
  keep_old_rest := new.updated_at < old.updated_at;

  if keep_old_check then
    new.checked := old.checked;
    new.checked_by := old.checked_by;
    new.checked_at := old.checked_at;
    new.check_changed_at := old.check_changed_at;
  end if;

  if keep_old_rest then
    new.product_id := old.product_id;
    new.aisle_id := old.aisle_id;
    new.name := old.name;
    new.quantity := old.quantity;
    new.unit := old.unit;
    new.note := old.note;
    new.deleted_at := old.deleted_at;
    new.updated_at := old.updated_at;
  end if;

  if keep_old_check and keep_old_rest then
    return null;
  end if;
  return new;
end;
$$;

create table public.shopping_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_id uuid not null,
  started_by uuid references public.profiles (id) on delete set null default auth.uid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (list_id, household_id) references public.lists (id, household_id) on delete cascade
);
create index shopping_sessions_active_idx on public.shopping_sessions (household_id) where ended_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  household_id uuid not null references public.households (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_household_idx on public.push_subscriptions (household_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_id uuid,
  shopping_session_id uuid references public.shopping_sessions (id) on delete set null,
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  image_path text not null,
  store_name text,
  purchased_at timestamptz,
  total numeric(10, 2),
  status text not null default 'processing'
    check (status in ('processing', 'review', 'confirmed', 'failed')),
  error_message text,
  raw_ai_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, household_id),
  foreign key (list_id, household_id) references public.lists (id, household_id) on delete set null (list_id)
);
create index receipts_household_idx on public.receipts (household_id, created_at desc);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  receipt_id uuid not null,
  product_id uuid,
  list_item_id uuid references public.list_items (id) on delete set null,
  description text not null,
  quantity numeric,
  unit_price numeric(10, 2),
  line_total numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (receipt_id, household_id) references public.receipts (id, household_id) on delete cascade,
  foreign key (product_id, household_id) references public.products (id, household_id)
);
create index receipt_lines_receipt_idx on public.receipt_lines (receipt_id);
create index receipt_lines_product_idx on public.receipt_lines (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'households', 'profiles', 'lists', 'aisles', 'products', 'list_items',
    'shopping_sessions', 'push_subscriptions', 'receipts', 'receipt_lines'
  ]
  loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.clamp_timestamps()',
      '10_' || t || '_clamp', t);
  end loop;

  foreach t in array array['lists', 'aisles', 'products', 'shopping_sessions']
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.last_write_wins()',
      '20_' || t || '_lww', t);
  end loop;
end;
$$;

create trigger "20_list_items_merge"
  before update on public.list_items
  for each row execute function public.list_items_merge();
