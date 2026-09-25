-- Which store a shopping trip is at, so the app can learn each store's aisle order from the
-- order things get ticked off there.
alter table public.shopping_sessions
  add column store text check (store in ('coles', 'woolworths', 'aldi', 'other'));
