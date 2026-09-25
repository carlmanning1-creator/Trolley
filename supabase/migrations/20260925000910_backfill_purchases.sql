-- Start purchase history from what has already been ticked off (including items since cleared),
-- so Running low doesn't have to wait for weeks of new ticks. Runs once.
insert into public.purchases (household_id, product_id, list_item_id, list_id, bought_by, bought_at)
select li.household_id, li.product_id, li.id, li.list_id, li.checked_by, li.checked_at
from public.list_items li
where li.checked
  and li.checked_at is not null
  and li.product_id is not null
  and not exists (select 1 from public.purchases p where p.list_item_id = li.id);
