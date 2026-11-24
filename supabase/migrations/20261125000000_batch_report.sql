-- Vape POS: the owner's batch report (Sales → Finance → Report).
--
-- batch_report(p_batch) answers, for one batch, what the statement on Finance → Batches doesn't list:
--   days      each day with sales: pieces sold, and the running pieces and net sales (paid or not)
--   flavours  each product that came in with the batch: pieces received, sold, left, its last sale
--   owed      who still owes for the batch's pieces, one line per buyer (names grouped like Collectibles)
--   paid      what was collected for the batch's pieces, by payment method
-- Pieces are matched to batches first in, first out (batch_matches), like every batch figure, so the
-- last day's running net sales is the statement's net sales and the buyers add up to its "still owed".
-- A sale with pieces from two batches counts in each by its share of the sale's net. The totals (costs,
-- expenses, net profit) come from batch_statements and the expenses, as on Finance → Batches.
-- Owner only.

create function public.batch_report(p_batch uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_b   public.stock_batches;
  v_out jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can see batch reports' using errcode = '42501';
  end if;
  select * into v_b from public.stock_batches where id = p_batch;
  if not found then
    raise exception 'Batch not found' using errcode = 'P0002';
  end if;

  with
  m as (
    select bm.sale_id, bm.product_id, bm.pcs, bm.net_each, bm.owed_each,
           (bm.sold_at at time zone 'Asia/Manila')::date as d
      from public.batch_matches() bm
     where bm.batch_id = p_batch and bm.pcs > 0
  ),
  days as (
    select d, sum(pcs) as pcs, sum(pcs * net_each) as net
      from m
     group by d
  ),
  days_run as (
    select d, pcs::int as pcs,
           (sum(pcs) over (order by d))::int as cum_pcs,
           round(sum(net) over (order by d))::bigint as cum_net_cents
      from days
  ),
  came as (
    select sm.product_id,
           coalesce(sum(sm.delta) filter (where sm.kind in ('opening', 'restock') and sm.delta > 0), 0) as received,
           coalesce(sum(sm.delta) filter (where sm.kind in ('count', 'waste')), 0) as adjusted
      from public.stock_movements sm
     where sm.batch_id = p_batch
     group by sm.product_id
  ),
  flav as (
    select c.product_id, p.brand, p.name, p.variant, c.received::int as received,
           coalesce(s.sold, 0)::int as sold,
           greatest(0, c.received - coalesce(s.sold, 0) + c.adjusted)::int as left_pcs,
           s.last_d as last_sale_on
      from came c
      join public.products p on p.id = c.product_id
      left join (select product_id, sum(pcs) as sold, max(d) as last_d from m group by product_id) s
        on s.product_id = c.product_id
     where c.received > 0
  ),
  owed as (
    select min(regexp_replace(btrim(s.customer_name), '\s+', ' ', 'g')) as buyer,
           round(sum(m.pcs * m.owed_each))::bigint as cents,
           count(distinct m.sale_id)::int as sales
      from m
      join public.sales s on s.id = m.sale_id
     where m.owed_each > 0
     group by lower(regexp_replace(btrim(coalesce(s.customer_name, '')), '\s+', ' ', 'g'))
  ),
  -- Each sale's share of the batch: the batch's net from it over the sale's total.
  share as (
    select sale_id, sum(pcs * net_each) as net from m group by sale_id
  ),
  -- What each sale collected, by method: at the till (what isn't owed and wasn't collected later) and later.
  got as (
    select s.id as sale_id, s.payment_method::text as method,
           (s.total_cents - s.balance_cents
              - coalesce((select sum(p.amount_cents) from public.sale_payments p where p.sale_id = s.id), 0))::numeric as cents
      from public.sales s
     where s.id in (select sale_id from share)
    union all
    select p.sale_id, p.payment_method::text, p.amount_cents::numeric
      from public.sale_payments p
     where p.sale_id in (select sale_id from share)
  ),
  paid as (
    select g.method, round(sum(g.cents * sh.net / s.total_cents))::bigint as cents
      from got g
      join share sh on sh.sale_id = g.sale_id
      join public.sales s on s.id = g.sale_id
     where g.cents <> 0 and g.method <> 'unpaid' and s.total_cents > 0
     group by g.method
  )
  select jsonb_build_object(
    'batch_id', v_b.id,
    'batch_no', v_b.batch_no,
    'received_on', v_b.received_on,
    'supplier', v_b.supplier,
    'paid_from_funds', v_b.paid_from_funds,
    'today', public.manila_today(),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'pcs', pcs, 'cum_pcs', cum_pcs, 'cum_net_cents', cum_net_cents)
                                       order by d) from days_run), '[]'::jsonb),
    'flavours', coalesce((select jsonb_agg(jsonb_build_object('product_id', product_id, 'brand', brand, 'name', name,
                                                              'variant', variant, 'received', received, 'sold', sold,
                                                              'left', left_pcs, 'last_sale_on', last_sale_on)
                                           order by name, variant) from flav), '[]'::jsonb),
    'owed', coalesce((select jsonb_agg(jsonb_build_object('buyer', buyer, 'cents', cents, 'sales', sales)
                                       order by cents desc, buyer) from owed where cents > 0), '[]'::jsonb),
    'paid', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'cents', cents) order by cents desc)
                        from paid where cents <> 0), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.batch_report(uuid) from public, anon;
grant execute on function public.batch_report(uuid) to authenticated;
