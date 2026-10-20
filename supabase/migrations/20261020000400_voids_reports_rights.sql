-- Vape POS: voids, reports, and who may call which function.

-- Void a sale (wrong item, customer returned it unopened). Owners and managers. Puts the stock back.
create function public.void_sale(p_sale uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.sale_status;
  r        record;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can void a sale' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Add a reason for the void' using errcode = '22023';
  end if;
  select status into v_status from public.sales where id = p_sale for update;
  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;
  if v_status = 'voided' then
    raise exception 'This sale is already voided' using errcode = '22023';
  end if;

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = left(btrim(p_reason), 200)
   where id = p_sale;

  for r in
    select si.product_id, sum(si.quantity)::int as qty
      from public.sale_items si
      join public.products pr on pr.id = si.product_id
     where si.sale_id = p_sale
     group by si.product_id
     order by si.product_id
  loop
    perform 1 from public.products where id = r.product_id for update;
    perform public.move_stock(r.product_id, 'void', r.qty, p_sale, null, 'Sale voided');
  end loop;
end;
$$;

-- ───────── Reports ─────────
-- Totals for Manila days p_from..p_to. Staff may only ask for today; cost and profit are
-- returned to owners and managers only.
create function public.sales_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mgr  boolean := public.is_manager();
  v_out  jsonb;
begin
  if not public.is_staff() then
    raise exception 'Your account isn''t active' using errcode = '42501';
  end if;
  if not v_mgr and (p_from <> public.manila_today() or p_to <> public.manila_today()) then
    raise exception 'Past days are for owners and managers' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a range of up to a year' using errcode = '22023';
  end if;

  with s as (
    select * from public.sales where business_date between p_from and p_to
  ), done as (
    select * from s where status = 'completed'
  ), items as (
    select si.* from public.sale_items si join done on done.id = si.sale_id
  )
  select jsonb_build_object(
    'sales',          (select count(*) from done),
    'voided',         (select count(*) from s where status = 'voided'),
    'gross_cents',    (select coalesce(sum(subtotal_cents), 0) from done),
    'discount_cents', (select coalesce(sum(discount_cents), 0) from done),
    'net_cents',      (select coalesce(sum(total_cents), 0) from done),
    'pieces',         (select coalesce(sum(quantity), 0) from items),
    'by_method',      (select coalesce(jsonb_object_agg(payment_method, jsonb_build_object('count', n, 'cents', c)), '{}'::jsonb)
                         from (select payment_method, count(*) n, sum(total_cents) c from done group by 1) m),
    'cogs_cents',     case when v_mgr then (select coalesce(sum(unit_cost_cents * quantity), 0) from items) end,
    'uncosted_lines', case when v_mgr then (select count(*) from items where unit_cost_cents is null) end,
    'top',            (select coalesce(jsonb_agg(t order by t.qty desc, t.cents desc), '[]'::jsonb) from (
                         select name, sum(quantity)::int qty, sum(line_total_cents)::int cents
                           from items group by name order by 2 desc, 3 desc limit 10) t)
  ) into v_out;
  return v_out;
end;
$$;

-- Stock value at cost (owners and managers).
create function public.stock_value()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when public.is_manager() then jsonb_build_object(
    'cost_cents',   coalesce(sum(greatest(p.on_hand, 0) * pc.cost_cents), 0),
    'retail_cents', coalesce(sum(greatest(p.on_hand, 0) * p.price_cents), 0),
    'pieces',       coalesce(sum(greatest(p.on_hand, 0)), 0),
    'uncosted',     count(*) filter (where pc.cost_cents is null and p.on_hand > 0)
  ) end
  from public.products p
  left join public.product_costs pc on pc.product_id = p.id
  where p.active
$$;

-- ───────── Function rights ─────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.keep_an_owner() from public, anon, authenticated;
revoke execute on function public.set_sale_number() from public, anon, authenticated;
revoke execute on function public.move_stock(uuid, text, int, uuid, int, text) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_role()', 'public.is_staff()', 'public.is_manager()', 'public.is_owner()',
    'public.manila_today()', 'public.staff_accounts()',
    'public.save_product(uuid, jsonb)',
    'public.adjust_stock(uuid, text, int, int, text)',
    'public.complete_sale(jsonb)',
    'public.void_sale(uuid, text)',
    'public.sales_summary(date, date)',
    'public.stock_value()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
