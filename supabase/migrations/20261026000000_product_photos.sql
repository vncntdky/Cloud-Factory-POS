-- Vape POS: a photo for each product. Applied to the project on 26 Oct 2026.

-- Path of an object in the product-photos bucket: <product id>/<file name>.
alter table public.products
  add column photo_path text check (photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$');

-- 5 MB images. (Made public in 20261027000100_buyers_and_collectibles.sql.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Any active staff member can view, upload, replace and remove product photos.
create policy "staff read product photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-photos' and public.is_staff());

create policy "staff upload product photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_staff()
              and exists (select 1 from public.products p
                          where p.id::text = (storage.foldername(name))[1]));

create policy "staff replace product photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and public.is_staff())
  with check (bucket_id = 'product-photos' and public.is_staff());

create policy "staff remove product photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_staff());

-- Attach (or clear, with null) a product's photo after uploading it.
create or replace function public.set_product_photo(p_product uuid, p_path text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_staff() then
    raise exception 'Only staff can change product photos' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_product::text then
    raise exception 'That photo belongs to a different product' using errcode = '22023';
  end if;
  if p_path is not null and not exists (
       select 1 from storage.objects where bucket_id = 'product-photos' and name = p_path) then
    raise exception 'Upload the photo first' using errcode = '22023';
  end if;
  update public.products set photo_path = p_path, updated_at = now() where id = p_product;
  if not found then
    raise exception 'That product no longer exists' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.set_product_photo(uuid, text) from public, anon;
grant execute on function public.set_product_photo(uuid, text) to authenticated;
