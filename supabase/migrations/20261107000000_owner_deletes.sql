-- Owner clean-up: permanently delete test sales and test products, as if they never happened.
-- Voiding stays the way to undo a real sale (the record stays, marked voided); deleting is for data
-- that shouldn't be in the books at all. Owner only.

-- Internal: remove one sale with its items, payments and stock moves. The pieces it took go back
-- on the shelf (a voided sale's moves already cancel out, so its products don't change).
create function public.remove_sale(p_sale uuid)
returns void
language plpgsql set search_path = ''
as $$
begin
  update public.products p set on_hand = p.on_hand - m.delta, updated_at = now()
    from (select product_id, sum(delta) as delta
            from public.stock_movements
           where sale_id = p_sale
           group by product_id) m
   where p.id = m.product_id and m.delta <> 0;
  delete from public.stock_movements where sale_id = p_sale;
  delete from public.sales where id = p_sale; -- sale_items and sale_payments cascade
end;
$$;

create function public.delete_sale(p_sale uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can delete sales' using errcode = '42501';
  end if;
  perform 1 from public.sales where id = p_sale for update;
  if not found then
    raise exception 'That sale no longer exists' using errcode = 'P0002';
  end if;
  perform public.remove_sale(p_sale);
end;
$$;

-- Delete a product with its stock history and cost. p_with_sales also deletes every sale that has
-- it (whole sales: their other products' pieces go back on the shelf). Without it, those sales stay
-- under the product's name. A batch left with no products goes too.
-- Returns {"sales_deleted": n, "photo_path": "…" or null} so the app can remove the photo file.
create function public.delete_product(p_product uuid, p_with_sales boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_photo   text;
  v_sale    uuid;
  v_sales   int := 0;
  v_batches uuid[];
begin
  if not public.is_owner() then
    raise exception 'Only the owner can delete products' using errcode = '42501';
  end if;
  select photo_path into v_photo from public.products where id = p_product for update;
  if not found then
    raise exception 'That product no longer exists' using errcode = 'P0002';
  end if;

  if p_with_sales then
    for v_sale in select distinct sale_id from public.sale_items where product_id = p_product loop
      perform public.remove_sale(v_sale);
      v_sales := v_sales + 1;
    end loop;
  end if;

  select coalesce(array_agg(distinct batch_id), '{}') into v_batches
    from public.stock_movements where product_id = p_product and batch_id is not null;
  delete from public.products where id = p_product; -- stock_movements and product_costs cascade
  delete from public.stock_batches b
   where b.id = any (v_batches)
     and not exists (select 1 from public.stock_movements m where m.batch_id = b.id);

  return jsonb_build_object('sales_deleted', v_sales, 'photo_path', v_photo);
end;
$$;

revoke execute on function public.remove_sale(uuid) from public, anon, authenticated;
revoke execute on function public.delete_sale(uuid) from public, anon;
grant execute on function public.delete_sale(uuid) to authenticated;
revoke execute on function public.delete_product(uuid, boolean) from public, anon;
grant execute on function public.delete_product(uuid, boolean) to authenticated;
