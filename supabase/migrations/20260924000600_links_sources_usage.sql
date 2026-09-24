-- A link on each list item (for things like a Wish List product page).
alter table public.list_items add column link text
  check (link is null or (link ~* '^https?://' and char_length(link) <= 2000));

-- Keep the link when edits merge (list_items_merge only copies the fields it knows about).
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
    new.link := old.link;
    new.deleted_at := old.deleted_at;
    new.updated_at := old.updated_at;
  end if;

  if keep_old_check and keep_old_rest then
    return null;
  end if;
  return new;
end;
$$;

-- Two more places a picture can come from: Wikimedia Commons, and a web page found by Claude.
alter table public.products drop constraint products_image_source_check;
alter table public.products add constraint products_image_source_check
  check (image_source in ('off', 'photo', 'upload', 'none', 'commons', 'web'));

-- Monthly counters for paid lookups (Claude web search), so they can be capped.
-- Only server routes write here, using the service key; people can read their household's.
create table public.usage_counters (
  household_id uuid not null references public.households (id) on delete cascade,
  month text not null, -- YYYY-MM
  kind text not null,
  count integer not null default 0,
  primary key (household_id, month, kind)
);
alter table public.usage_counters enable row level security;
create policy usage_counters_select on public.usage_counters
  for select to authenticated using (household_id = (select public.my_household_id()));

-- Adds one to a counter and returns the new value, atomically.
create or replace function public.bump_usage(p_household uuid, p_month text, p_kind text)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters (household_id, month, kind, count)
  values (p_household, p_month, p_kind, 1)
  on conflict (household_id, month, kind) do update set count = public.usage_counters.count + 1
  returning count;
$$;
revoke all on function public.bump_usage(uuid, text, text) from public, anon, authenticated;
