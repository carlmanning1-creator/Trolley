-- History: one row for each thing that happens to a list item (added, ticked, unticked, deleted,
-- cleared, brought back), with who and when. Written by the phone that did it, through the
-- same offline outbox as everything else, and never changed afterwards.

create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_id uuid,
  list_item_id uuid,
  product_id uuid,
  name text not null,
  kind text not null check (kind in ('added', 'readded', 'ticked', 'unticked', 'deleted', 'cleared', 'restored', 'merged')),
  actor uuid references public.profiles (id) on delete set null,
  at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default clock_timestamp()
);
create index item_events_synced_idx on public.item_events (household_id, synced_at);
create index item_events_at_idx on public.item_events (household_id, at desc);

create trigger "10_item_events_clamp" before insert or update on public.item_events
  for each row execute function public.clamp_timestamps();
create trigger "20_item_events_lww" before update on public.item_events
  for each row execute function public.last_write_wins();
create trigger "30_item_events_synced" before insert or update on public.item_events
  for each row execute function public.stamp_synced_at();

alter table public.item_events enable row level security;
revoke all on public.item_events from anon;
create policy item_events_select on public.item_events
  for select to authenticated using (household_id = (select public.my_household_id()));
create policy item_events_insert on public.item_events
  for insert to authenticated with check (household_id = (select public.my_household_id()));
create policy item_events_update on public.item_events
  for update to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

alter publication supabase_realtime add table public.item_events;

-- Fill in what already happened, from the records kept so far. Who deleted or cleared
-- something wasn't recorded before now, so those show without a name.
insert into public.item_events (household_id, list_id, list_item_id, product_id, name, kind, actor, at)
select household_id, list_id, id, product_id, name, 'added', added_by, created_at
from public.list_items;

insert into public.item_events (household_id, list_id, list_item_id, product_id, name, kind, actor, at)
select p.household_id, p.list_id, p.list_item_id, p.product_id, coalesce(li.name, pr.name), 'ticked', p.bought_by, p.bought_at
from public.purchases p
join public.products pr on pr.id = p.product_id
left join public.list_items li on li.id = p.list_item_id;

insert into public.item_events (household_id, list_id, list_item_id, product_id, name, kind, actor, at)
select p.household_id, p.list_id, p.list_item_id, p.product_id, coalesce(li.name, pr.name), 'unticked', p.bought_by, p.deleted_at
from public.purchases p
join public.products pr on pr.id = p.product_id
left join public.list_items li on li.id = p.list_item_id
where p.deleted_at is not null;

insert into public.item_events (household_id, list_id, list_item_id, product_id, name, kind, actor, at)
select household_id, list_id, id, product_id, name, case when checked then 'cleared' else 'deleted' end, null, deleted_at
from public.list_items
where deleted_at is not null;
