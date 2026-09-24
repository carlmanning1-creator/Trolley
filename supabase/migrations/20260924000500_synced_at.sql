-- synced_at is stamped by the server on every write. Devices catch up with
-- "give me rows with synced_at after X", which still finds an edit made offline hours ago
-- (its updated_at is old, but it reached the server just now).

create or replace function public.stamp_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'households', 'profiles', 'lists', 'aisles', 'products', 'list_items', 'shopping_sessions', 'receipts'
  ]
  loop
    execute format(
      'alter table public.%I add column synced_at timestamptz not null default clock_timestamp()', t);
    -- Runs after the conflict triggers (names sort after 10_ and 20_), so skipped writes stay unstamped.
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.stamp_synced_at()',
      '30_' || t || '_synced', t);
    if t = 'households' then
      execute 'create index households_synced_idx on public.households (synced_at)';
    else
      execute format('create index %I on public.%I (household_id, synced_at)', t || '_synced_idx', t);
    end if;
  end loop;
end;
$$;
