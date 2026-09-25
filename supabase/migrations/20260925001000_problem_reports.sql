-- "Report a problem" (Settings). Written and read only through the server, which checks who
-- is asking, so there are no row policies for signed-in users: row level security on with no
-- policies means only the server's secret key can touch these rows.

create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  reported_by uuid references public.profiles (id) on delete set null,
  message text not null check (char_length(message) between 1 and 2000),
  screenshot_path text,
  diagnostics jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'fixed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index problem_reports_household_idx on public.problem_reports (household_id, created_at desc);

alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from anon, authenticated;

-- Screenshots attached to reports. Private; the server uploads them and hands out
-- short-lived links to the household admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('problem-reports', 'problem-reports', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
