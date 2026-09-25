-- Swipe to tick or delete is a personal choice (Settings, You). On unless someone turns it off.
alter table public.profiles add column swipe_actions boolean not null default true;
