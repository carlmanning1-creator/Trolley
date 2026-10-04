-- What a tap on an item does is a personal choice (Settings, You). Off by default: a tap on the
-- tick circle ticks, a tap anywhere else opens the item. On: a tap anywhere on the item ticks it.
alter table public.profiles add column tap_to_tick boolean not null default false;
