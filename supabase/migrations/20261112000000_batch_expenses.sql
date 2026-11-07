-- Expenses can belong to a batch (that batch's P&L) or be general shop costs (no batch), which come
-- off the shop's total in Sales → P&L. A batch with expenses is never removed when its last product
-- is deleted, so no expense is lost.
alter table public.expenses
  add column batch_id uuid references public.stock_batches (id);
create index expenses_batch_idx on public.expenses (batch_id);

-- p: {batch_id (optional), spent_on, category, amount_cents, note}
create or replace function public.add_expense(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id     uuid;
  v_batch  uuid := nullif(p ->> 'batch_id', '')::uuid;
  v_date   date := coalesce(nullif(p ->> 'spent_on', '')::date, public.manila_today());
  v_amount int := nullif(p ->> 'amount_cents', '')::int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can record expenses' using errcode = '42501';
  end if;
  if v_batch is not null and not exists (select 1 from public.stock_batches where id = v_batch) then
    raise exception 'That batch no longer exists' using errcode = '22023';
  end if;
  if coalesce(p ->> 'category', '') not in ('salary', 'rent', 'utilities', 'supplies', 'other') then
    raise exception 'Pick what the expense was for' using errcode = '22023';
  end if;
  if v_amount is null or v_amount not between 1 and 100000000 then
    raise exception 'Enter an amount from ₱0.01 to ₱1,000,000' using errcode = '22023';
  end if;
  if v_date > public.manila_today() or v_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  insert into public.expenses (batch_id, spent_on, category, amount_cents, note)
  values (v_batch, v_date, p ->> 'category', v_amount, nullif(btrim(p ->> 'note'), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- delete_product: an emptied batch is removed only if it has no expenses either.
create or replace function public.delete_product(p_product uuid, p_with_sales boolean default false)
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
     and not exists (select 1 from public.stock_movements m where m.batch_id = b.id)
     and not exists (select 1 from public.expenses e where e.batch_id = b.id);

  return jsonb_build_object('sales_deleted', v_sales, 'photo_path', v_photo);
end;
$$;
