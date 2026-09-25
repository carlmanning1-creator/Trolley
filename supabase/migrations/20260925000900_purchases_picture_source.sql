-- Purchase history and picture sources (Sept 2026).
--
-- purchases: one row each time an item is ticked off, so the app can learn how often things
-- are bought (Running low) without anyone scanning receipts. An untick soon after removes it.
-- products: where the picture came from, pictures people rejected, and items they never
-- want suggested.

alter table public.products
  add column image_source_url text,
  add column rejected_sources text[] not null default '{}',
  add column hide_running_low boolean not null default false;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid not null,
  -- Loose references (no foreign keys): history outlives the list items and trips it came from.
  list_item_id uuid,
  list_id uuid,
  session_id uuid,
  bought_by uuid references public.profiles (id) on delete set null default auth.uid(),
  bought_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp(),
  foreign key (product_id, household_id) references public.products (id, household_id) on delete cascade
);
create index purchases_synced_idx on public.purchases (household_id, synced_at);
create index purchases_product_idx on public.purchases (household_id, product_id);

create trigger "10_purchases_clamp" before insert or update on public.purchases
  for each row execute function public.clamp_timestamps();
create trigger "20_purchases_lww" before update on public.purchases
  for each row execute function public.last_write_wins();
create trigger "30_purchases_synced" before insert or update on public.purchases
  for each row execute function public.stamp_synced_at();

alter table public.purchases enable row level security;
revoke all on public.purchases from anon;
create policy purchases_select on public.purchases
  for select to authenticated using (household_id = (select public.my_household_id()));
create policy purchases_insert on public.purchases
  for insert to authenticated with check (household_id = (select public.my_household_id()));
create policy purchases_update on public.purchases
  for update to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy purchases_delete on public.purchases
  for delete to authenticated using (household_id = (select public.my_household_id()));

alter publication supabase_realtime add table public.purchases;
