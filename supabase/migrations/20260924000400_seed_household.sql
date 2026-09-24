-- The Manning household, its starting lists and the default aisle walk.
-- Lists updated to Carl's chosen set (Groceries, Bunnings, Other, Wish List); this only
-- affects a fresh install, the live household already has them.
-- People are added by scripts/seed-users.mjs, which creates the auth accounts first.

insert into public.households (id, name)
values ('6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01', 'Manning Household')
on conflict (id) do nothing;

insert into public.lists (household_id, name, icon, sort_order, use_aisles)
select '6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01', v.name, v.icon, v.sort_order, v.use_aisles
from (values
  ('Groceries', '🛒', 1, true),
  ('Bunnings', '🔨', 2, false),
  ('Other', '🛍️', 3, false),
  ('Wish List', '📝', 4, false)
) as v (name, icon, sort_order, use_aisles)
where not exists (
  select 1 from public.lists where household_id = '6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01'
);

insert into public.aisles (household_id, name, icon, sort_order)
select '6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01', v.name, v.icon, v.sort_order
from (values
  ('Fruit & Veg', '🥦', 1),
  ('Bakery', '🍞', 2),
  ('Deli', '🧀', 3),
  ('Meat & Seafood', '🥩', 4),
  ('Dairy & Eggs', '🥛', 5),
  ('Fridge', '🧊', 6),
  ('Frozen', '❄️', 7),
  ('Pantry', '🥫', 8),
  ('Breakfast', '🥣', 9),
  ('Snacks & Lollies', '🍫', 10),
  ('Drinks', '🧃', 11),
  ('Health & Beauty', '🧴', 12),
  ('Baby', '🍼', 13),
  ('Cleaning & Household', '🧽', 14),
  ('Pet', '🐾', 15),
  ('Other', '📦', 16)
) as v (name, icon, sort_order)
where not exists (
  select 1 from public.aisles where household_id = '6b0f5a52-8f7e-4c1e-9a53-3f7c2d1b9e01'
);
