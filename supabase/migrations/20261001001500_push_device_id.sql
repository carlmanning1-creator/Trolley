-- Which installed copy of the app a notification subscription belongs to, so re-registering
-- a phone replaces its old subscription instead of adding another (and sending twice).
alter table public.push_subscriptions add column device_id text;
