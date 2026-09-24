-- Row level security: a signed-in user can read and write only their own household's rows.

create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.my_household_id() from public, anon;
grant execute on function public.my_household_id() to authenticated;

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.aisles enable row level security;
alter table public.products enable row level security;
alter table public.list_items enable row level security;
alter table public.shopping_sessions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;

-- The anon role never touches app data.
revoke all on all tables in schema public from anon;

-- households: read and rename your own
create policy households_select on public.households
  for select to authenticated using (id = (select public.my_household_id()));
create policy households_update on public.households
  for update to authenticated
  using (id = (select public.my_household_id()))
  with check (id = (select public.my_household_id()));

-- profiles: see everyone in your household, edit only yourself, cannot change household
create policy profiles_select on public.profiles
  for select to authenticated using (household_id = (select public.my_household_id()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and household_id = (select public.my_household_id()));

-- Household-scoped tables: full read and write inside your household
do $$
declare
  t text;
begin
  foreach t in array array[
    'lists', 'aisles', 'products', 'list_items', 'shopping_sessions', 'receipts', 'receipt_lines'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (household_id = (select public.my_household_id()))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (household_id = (select public.my_household_id()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (household_id = (select public.my_household_id()))
         with check (household_id = (select public.my_household_id()))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (household_id = (select public.my_household_id()))',
      t || '_delete', t);
  end loop;
end;
$$;

-- push_subscriptions: each person manages only their own devices
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (profile_id = (select auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and household_id = (select public.my_household_id()));
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and household_id = (select public.my_household_id()));
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using (profile_id = (select auth.uid()));

-- Realtime: broadcast row changes for the tables the app mirrors locally.
-- Realtime applies the select policies above, so people only receive their own household's rows.
alter publication supabase_realtime add table
  public.lists,
  public.aisles,
  public.products,
  public.list_items,
  public.shopping_sessions,
  public.profiles,
  public.receipts;
