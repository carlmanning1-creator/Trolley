-- Private storage buckets. Every object path starts with the household id:
--   product-images/<household_id>/<product_id>-<timestamp>.webp
--   receipts/<household_id>/<receipt_id>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', false, 5242880,
    array['image/webp', 'image/jpeg', 'image/png']),
  ('receipts', 'receipts', false, 10485760,
    array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "household objects: select" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('product-images', 'receipts')
    and (storage.foldername(name))[1] = (select public.my_household_id())::text
  );

create policy "household objects: insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('product-images', 'receipts')
    and (storage.foldername(name))[1] = (select public.my_household_id())::text
  );

create policy "household objects: update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('product-images', 'receipts')
    and (storage.foldername(name))[1] = (select public.my_household_id())::text
  )
  with check (
    bucket_id in ('product-images', 'receipts')
    and (storage.foldername(name))[1] = (select public.my_household_id())::text
  );

create policy "household objects: delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('product-images', 'receipts')
    and (storage.foldername(name))[1] = (select public.my_household_id())::text
  );
