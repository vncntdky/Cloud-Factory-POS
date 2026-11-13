-- Finance: each batch's running profit and loss, and what the register should hold.
--   * batch_statements(): one row per batch (batch_id null = stock from before batches) with the
--     figures Finance → Batches lists line by line: sales before and after discounts, the landed
--     cost of the pieces sold (what they cost + their share of the batch's restocking fees), count
--     differences at landed cost, what is still owed, what the batch cost in full and what is left
--     on the shelf. It uses the same matching and costs as finance_totals, so the batches add up to
--     Profit & loss (to the centavo each batch is rounded). The batch's expenses are read from
--     public.expenses by the page, which lists each one.
--   * finance_now() also splits today's cash into the register and the other payment methods.
--     The app does not record which pocket paid for stock, restocking fees, expenses, taxes or
--     distributions, so all of them are taken as paid in cash, except payment fees (GCash, Maya,
--     card and bank fees), which come off the money those methods hold:
--       should be in the register = cash received + capital put in − everything paid out
--                                 = cash − receipts by the other methods + payment fees.

-- ───────── Each batch's running statement ─────────
create function public.batch_statements()
returns table (batch_id uuid, received int, sold int, adjusted int, left_pcs int, uncosted int,
               gross_cents bigint, discount_cents bigint, net_cents bigint,
               cogs_goods_cents bigint, cogs_fees_cents bigint, count_diffs_cents bigint,
               owed_cents bigint, goods_cents bigint, fees_cents bigint, stock_cents bigint,
               left_value_cents bigint, left_cost_cents bigint)
language sql stable security definer set search_path = ''
as $$
  with
  -- Stock that came in, with its cost per piece (as in finance_totals).
  arr as (
    select m.id, m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
           m.unit_cost_cents is null as uncosted, (m.created_at at time zone 'Asia/Manila')::date as d
      from public.stock_movements m
     where m.kind in ('opening', 'restock') and m.delta > 0
  ),
  -- Restocking fees per batch, spread over the pieces it received.
  bfee as (
    select b.id, b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as fees,
           (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric
             / nullif((select sum(a.qty) from arr a where a.batch_id = b.id), 0) as pp
      from public.stock_batches b
  ),
  -- Price per piece before the sale's discount, per sale and product.
  line as (
    select i.sale_id, i.product_id, sum(i.line_total_cents)::numeric / sum(i.quantity) as gross_each
      from public.sale_items i
     where i.product_id is not null
     group by i.sale_id, i.product_id
  ),
  -- Pieces sold, first in first out, by the batch they came in with.
  sold as (
    select a.batch_id, a.product_id,
           sum(m.pcs) as pcs,
           sum(m.pcs * coalesce(l.gross_each, m.net_each)) as gross,
           sum(m.pcs * m.net_each) as net,
           sum(m.pcs * m.owed_each) as owed,
           sum(m.pcs * a.uc) as goods,
           sum(m.pcs * coalesce(f.pp, 0)) as fees,
           coalesce(sum(m.pcs) filter (where a.uncosted), 0) as uncosted
      from public.batch_matches() m
      join arr a on a.id = m.arrival_id
      left join bfee f on f.id = a.batch_id
      left join line l on l.sale_id = m.sale_id and l.product_id = m.product_id
     where m.pcs > 0
     group by a.batch_id, a.product_id
  ),
  came as (
    select a.batch_id, a.product_id, sum(a.qty) as qty, sum(a.qty * a.uc) as goods
      from arr a
     group by a.batch_id, a.product_id
  ),
  -- Counts and losses at landed cost (negative = pieces missing), as in finance_totals.
  adj as (
    select m.batch_id, m.product_id, sum(m.delta) as pcs,
           sum(m.delta * (
             coalesce((select avg(a.uc) from arr a where a.batch_id is not distinct from m.batch_id and a.product_id = m.product_id),
                      (select a.uc from arr a where a.product_id = m.product_id order by a.d desc limit 1), 0)
             + coalesce((select f.pp from bfee f where f.id = m.batch_id), 0))) as cents
      from public.stock_movements m
     where m.kind in ('count', 'waste')
     group by m.batch_id, m.product_id
  ),
  keys as (
    select c.batch_id, c.product_id from came c
    union
    select j.batch_id, j.product_id from adj j
  ),
  per as (
    select k.batch_id, k.product_id,
           coalesce(c.qty, 0) as received, coalesce(c.goods, 0) as goods,
           coalesce(s.pcs, 0) as sold, coalesce(s.gross, 0) as gross, coalesce(s.net, 0) as net,
           coalesce(s.owed, 0) as owed, coalesce(s.goods, 0) as cogs_goods, coalesce(s.fees, 0) as cogs_fees,
           coalesce(s.uncosted, 0) as uncosted,
           coalesce(j.pcs, 0) as adjusted, coalesce(j.cents, 0) as diffs,
           -- Pieces of this batch still to sell: only for products that came in with it.
           case when c.qty is null then 0
                else greatest(0, c.qty - coalesce(s.pcs, 0) + coalesce(j.pcs, 0)) end as left_pcs,
           -- What one of those pieces cost: the batch's average for the product + its share of the fees.
           coalesce(c.goods / nullif(c.qty, 0), 0) + coalesce(f.pp, 0) as landed_each
      from keys k
      left join came c on c.batch_id is not distinct from k.batch_id and c.product_id = k.product_id
      left join sold s on s.batch_id is not distinct from k.batch_id and s.product_id = k.product_id
      left join adj j on j.batch_id is not distinct from k.batch_id and j.product_id = k.product_id
      left join bfee f on f.id = k.batch_id
  ),
  agg as (
    select p.batch_id,
           sum(p.received) as received, sum(p.sold) as sold, sum(p.adjusted) as adjusted, sum(p.left_pcs) as left_pcs,
           sum(p.uncosted) as uncosted, sum(p.gross) as gross, sum(p.net) as net, sum(p.owed) as owed,
           sum(p.cogs_goods) as cogs_goods, sum(p.cogs_fees) as cogs_fees, sum(p.diffs) as diffs, sum(p.goods) as goods,
           sum(p.left_pcs * coalesce(pr.price_cents, 0)) as left_value,
           sum(p.left_pcs * p.landed_each) as left_cost
      from per p
      left join public.products pr on pr.id = p.product_id
     group by p.batch_id
  ),
  ids as (
    select b.id as batch_id from public.stock_batches b
    union
    select a.batch_id from agg a
  )
  select i.batch_id,
         coalesce(a.received, 0)::int, coalesce(a.sold, 0)::int, coalesce(a.adjusted, 0)::int,
         coalesce(a.left_pcs, 0)::int, coalesce(a.uncosted, 0)::int,
         round(coalesce(a.gross, 0))::bigint,
         (round(coalesce(a.gross, 0)) - round(coalesce(a.net, 0)))::bigint,
         round(coalesce(a.net, 0))::bigint,
         round(coalesce(a.cogs_goods, 0))::bigint,
         round(coalesce(a.cogs_fees, 0))::bigint,
         round(coalesce(a.diffs, 0))::bigint,
         round(coalesce(a.owed, 0))::bigint,
         round(coalesce(a.goods, 0))::bigint,
         coalesce(f.fees, 0)::bigint,
         -- Still on the shelf at landed cost. Fees count once the batch has pieces, as in Finance.
         round(coalesce(a.goods, 0) + case when f.pp is null then 0 else f.fees end
               - coalesce(a.cogs_goods, 0) - coalesce(a.cogs_fees, 0) + coalesce(a.diffs, 0))::bigint,
         round(coalesce(a.left_value, 0))::bigint,
         -- The pieces left at landed cost, on the same pieces as left_value (stock_cents ties to Finance).
         round(coalesce(a.left_cost, 0))::bigint
    from ids i
    left join agg a on a.batch_id is not distinct from i.batch_id
    left join bfee f on f.id = i.batch_id
   where public.is_manager()
$$;

revoke execute on function public.batch_statements() from public, anon;
grant execute on function public.batch_statements() to authenticated;

-- ───────── Today's payout limit, and what the register should hold (internal) ─────────
create or replace function public.finance_now()
returns jsonb
language sql stable set search_path = ''
as $$
  with t as (select public.finance_derive(public.finance_totals(public.manila_today())) as d),
       f as (select (public.funds_summary() ->> 'kept_cents')::numeric as kept),
       -- Money that came in by a method other than cash: it never reaches the register.
       e as (select coalesce(sum(m.value::numeric), 0) as cents,
                    coalesce(jsonb_object_agg(m.key, m.value::numeric), '{}'::jsonb) as by_method
               from t, jsonb_each_text(t.d -> 'collected_by_method') m
              where m.key <> 'cash')
  select jsonb_build_object(
    'cash', (d ->> 'cash')::numeric,
    'retained', (d ->> 'retained')::numeric,
    'tax_reserve', greatest(0, (d ->> 'tax_payable')::numeric),
    'inventory_reserve', f.kept,
    'spare_cash', (d ->> 'cash')::numeric - greatest(0, (d ->> 'tax_payable')::numeric) - f.kept,
    'safe_to_distribute', greatest(0, least((d ->> 'retained')::numeric,
                              (d ->> 'cash')::numeric - greatest(0, (d ->> 'tax_payable')::numeric) - f.kept)),
    'register', jsonb_build_object(
      'cash_received', coalesce((d -> 'collected_by_method' ->> 'cash')::numeric, 0),
      'capital_cash', (d ->> 'capital_cash')::numeric,
      'stock', (d ->> 'fund_goods')::numeric,
      'fees', (d ->> 'fund_fees')::numeric,
      'expenses', (d ->> 'opex')::numeric - coalesce((d -> 'opex_by_category' ->> 'fees')::numeric, 0),
      'payment_fees', coalesce((d -> 'opex_by_category' ->> 'fees')::numeric, 0),
      'tax_paid', (d ->> 'tax_paid')::numeric,
      'distributions', (d ->> 'distributions')::numeric,
      'elsewhere', e.cents,
      'elsewhere_by_method', e.by_method,
      'expected', (d ->> 'cash')::numeric - e.cents + coalesce((d -> 'opex_by_category' ->> 'fees')::numeric, 0)))
  from t, f, e
$$;
