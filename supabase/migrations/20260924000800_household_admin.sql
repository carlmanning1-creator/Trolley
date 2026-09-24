-- Household admins can add and remove people (Settings, People). Only the server, using the
-- secret key, can make someone an admin: people can edit their own profile, so a guard stops
-- anyone signed in from switching the flag on for themselves.

alter table public.profiles add column is_admin boolean not null default false;

create or replace function public.guard_profile_admin()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from (case when tg_op = 'INSERT' then false else old.is_admin end)
     and current_user in ('authenticated', 'anon') then
    raise exception 'Only the server can change who is a household admin'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_admin
  before insert or update on public.profiles
  for each row execute function public.guard_profile_admin();

-- Carl set the household up, so he manages its people.
update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id
  and lower(u.email) = 'carlmanning1@gmail.com';
