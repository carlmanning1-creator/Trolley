-- Items someone has confirmed are NOT duplicates of each other, so the flag stays away.
alter table public.list_items add column distinct_from uuid[] not null default '{}';

create or replace function public.list_items_merge()
returns trigger
language plpgsql
as $$
declare
  keep_old_check boolean;
  keep_old_rest boolean;
begin
  keep_old_check := old.check_changed_at is not null
    and (new.check_changed_at is null or new.check_changed_at < old.check_changed_at);
  keep_old_rest := new.updated_at < old.updated_at;

  if keep_old_check then
    new.checked := old.checked;
    new.checked_by := old.checked_by;
    new.checked_at := old.checked_at;
    new.check_changed_at := old.check_changed_at;
  end if;

  if keep_old_rest then
    new.product_id := old.product_id;
    new.aisle_id := old.aisle_id;
    new.name := old.name;
    new.quantity := old.quantity;
    new.unit := old.unit;
    new.note := old.note;
    new.link := old.link;
    new.distinct_from := old.distinct_from;
    new.deleted_at := old.deleted_at;
    new.updated_at := old.updated_at;
  end if;

  if keep_old_check and keep_old_rest then
    return null;
  end if;
  return new;
end;
$$;
