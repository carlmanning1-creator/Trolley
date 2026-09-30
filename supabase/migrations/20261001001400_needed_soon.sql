-- "Needed soon": a flag anyone can put on an item so whoever is next at the shops grabs it.
-- A ticked item no longer counts as needed, so ticking never has to touch the flag.
alter table public.list_items add column needed_soon boolean not null default false;

-- Keep the flag with the rest of an item's details when an older edit arrives late.
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
    new.needed_soon := old.needed_soon;
    new.deleted_at := old.deleted_at;
    new.updated_at := old.updated_at;
  end if;

  if keep_old_check and keep_old_rest then
    return null;
  end if;
  return new;
end;
$$;

-- History entries for flagging and unflagging.
alter table public.item_events drop constraint item_events_kind_check;
alter table public.item_events add constraint item_events_kind_check
  check (kind in ('added', 'readded', 'ticked', 'unticked', 'deleted', 'cleared', 'restored', 'merged', 'flagged', 'unflagged'));
