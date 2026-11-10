-- Finance: standard statements and a safe payout limit.
--   * capital_contributions: money the owners put into the business. A batch not paid from the
--     company funds (e.g. Batch 1) also counts as owner capital: the owners paid for that stock.
--   * settings.tax_rate_bp: percentage tax on net sales (300 = 3%), set by the owner; 0 = none.
--   * Expense categories gain 'tax' (taxes paid, not an operating expense) and 'fees' (GCash, Maya,
--     card and bank fees).
--   * finance_totals(day): running totals up to the end of that day (Manila). A period's figures
--     are the end day's totals minus the totals of the day before it starts; the balance is the end
--     day's totals. Landed cost per piece = its cost + the batch's restocking fees / pieces received.
--       cash        = capital put in in cash + collected − stock bought from the fund − its fees
--                     − expenses − taxes paid − owner distributions
--       receivables = net sales − collected
--       inventory   = all stock bought + all fees − cost of goods sold + count differences
--       net profit  = net sales − cost of goods sold + count differences − operating expenses − tax
--     so cash + receivables + inventory = tax payable + owner capital + net profit − distributions.
--   * finance_report(from, to): both ends, plus receivables by age and today's payout limit.
--   * A distribution (release) may not exceed the lower of profit kept in the business and spare
--     cash (cash − tax still owed − inventory reserve for the next restock).

-- ───────── Owner capital ─────────
create table public.capital_contributions (
  id            uuid primary key default gen_random_uuid(),
  amount_cents  bigint not null check (amount_cents between 1 and 100000000000),
  note          text check (char_length(note) <= 200),
  put_in_on     date not null default public.manila_today(),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index capital_contributions_created_by_idx on public.capital_contributions (created_by);
alter table public.capital_contributions enable row level security;
create policy "managers read capital_contributions" on public.capital_contributions
  for select to authenticated using ((select public.is_manager()));
revoke all on public.capital_contributions from anon;
revoke insert, update, delete on public.capital_contributions from authenticated;
grant select on public.capital_contributions to authenticated;

create function public.add_capital(p_amount_cents bigint, p_note text default null, p_put_in_on date default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id   uuid;
  v_date date := coalesce(p_put_in_on, public.manila_today());
begin
  if not public.is_owner() then
    raise exception 'Only the owner can record capital' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 100000000000 then
    raise exception 'Enter an amount from ₱0.01' using errcode = '22023';
  end if;
  if v_date > public.manila_today() or v_date < public.manila_today() - 3650 then
    raise exception 'The date can''t be in the future' using errcode = '22023';
  end if;
  insert into public.capital_contributions (amount_cents, note, put_in_on)
  values (p_amount_cents, nullif(btrim(p_note), ''), v_date)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.delete_capital(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can record capital' using errcode = '42501';
  end if;
  delete from public.capital_contributions where id = p_id;
  if not found then
    raise exception 'That entry no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- ───────── Tax rate ─────────
alter table public.settings add column tax_rate_bp int not null default 300 check (tax_rate_bp between 0 and 3000);

create function public.set_tax_rate(p_bp int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change the tax rate' using errcode = '42501';
  end if;
  if p_bp is null or p_bp not between 0 and 3000 then
    raise exception 'Enter a rate from 0%% to 30%%' using errcode = '22023';
  end if;
  update public.settings set tax_rate_bp = p_bp, updated_at = now() where id = 1;
end;
$$;

-- ───────── Expense categories: taxes paid, payment fees ─────────
alter table public.expenses drop constraint expenses_category_check;
alter table public.expenses add constraint expenses_category_check
  check (category in ('salary', 'rent', 'utilities', 'supplies', 'fees', 'tax', 'other'));

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
  if coalesce(p ->> 'category', '') not in ('salary', 'rent', 'utilities', 'supplies', 'fees', 'tax', 'other') then
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

-- ───────── Running totals up to the end of a day (internal) ─────────
create function public.finance_totals(p_to date)
returns jsonb
language sql stable set search_path = ''
as $$
  with
  sales as (
    select coalesce(sum(subtotal_cents), 0) as gross, coalesce(sum(discount_cents), 0) as discounts,
           coalesce(sum(total_cents), 0) as net, count(*) as n
      from public.sales where status = 'completed' and business_date <= p_to
  ),
  -- Money collected: what was paid at the till, then later payments on what was owed.
  receipts as (
    select s.payment_method::text as method,
           s.total_cents - s.balance_cents - coalesce((select sum(p.amount_cents) from public.sale_payments p where p.sale_id = s.id), 0) as cents
      from public.sales s
     where s.status = 'completed' and s.business_date <= p_to
    union all
    select p.payment_method::text, p.amount_cents
      from public.sale_payments p join public.sales s on s.id = p.sale_id
     where s.status = 'completed' and p.business_date <= p_to
  ),
  -- Stock that came in, with its cost per piece and whether the fund paid for it.
  arr as (
    select m.id, m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
           m.unit_cost_cents is null as uncosted, (m.created_at at time zone 'Asia/Manila')::date as d,
           coalesce(b.paid_from_funds, true) as fund
      from public.stock_movements m
      left join public.stock_batches b on b.id = m.batch_id
     where m.kind in ('opening', 'restock') and m.delta > 0
  ),
  -- Restocking fees per batch, spread over the pieces it received.
  bfee as (
    select b.id, b.received_on as d, b.paid_from_funds as fund,
           b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as fees,
           (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric
             / nullif((select sum(a.qty) from arr a where a.batch_id = b.id), 0) as pp
      from public.stock_batches b
  ),
  cogs as (
    select coalesce(sum(m.pcs * (a.uc + coalesce(f.pp, 0))), 0) as cents,
           coalesce(sum(m.pcs) filter (where a.uncosted), 0) as uncosted
      from public.batch_matches() m
      join arr a on a.id = m.arrival_id
      left join bfee f on f.id = m.batch_id
     where m.pcs > 0 and (m.sold_at at time zone 'Asia/Manila')::date <= p_to
  ),
  -- Counts and losses at landed cost (negative = pieces missing).
  diffs as (
    select coalesce(sum(m.delta * (
             coalesce((select avg(a.uc) from arr a where a.batch_id is not distinct from m.batch_id and a.product_id = m.product_id),
                      (select a.uc from arr a where a.product_id = m.product_id order by a.d desc limit 1), 0)
             + coalesce((select f.pp from bfee f where f.id = m.batch_id), 0))), 0) as cents
      from public.stock_movements m
     where m.kind in ('count', 'waste') and (m.created_at at time zone 'Asia/Manila')::date <= p_to
  ),
  bought as (
    select coalesce(sum(qty * uc) filter (where fund), 0) as fund_goods,
           coalesce(sum(qty * uc) filter (where not fund), 0) as owner_goods
      from arr where d <= p_to
  ),
  fees as (
    select coalesce(sum(fees) filter (where fund), 0) as fund_fees,
           coalesce(sum(fees) filter (where not fund), 0) as owner_fees
      from bfee where d <= p_to and pp is not null
  ),
  ex as (
    select coalesce(sum(amount_cents) filter (where category <> 'tax'), 0) as opex,
           coalesce(sum(amount_cents) filter (where category = 'tax'), 0) as tax_paid
      from public.expenses where spent_on <= p_to
  )
  select jsonb_build_object(
    'gross', s.gross, 'discounts', s.discounts, 'net', s.net, 'sales', s.n,
    'collected', (select coalesce(sum(cents), 0) from receipts),
    'collected_by_method', coalesce((select jsonb_object_agg(method, cents) from
       (select method, sum(cents) as cents from receipts group by method having sum(cents) <> 0) x), '{}'),
    'cogs', round(c.cents), 'cogs_uncosted', c.uncosted, 'count_diffs', round(d.cents),
    'opex', e.opex, 'opex_by_category', coalesce((select jsonb_object_agg(category, cents) from
       (select category, sum(amount_cents) as cents from public.expenses
         where spent_on <= p_to and category <> 'tax' group by category) x), '{}'),
    'tax_paid', e.tax_paid,
    'tax_rate_bp', (select tax_rate_bp from public.settings where id = 1),
    'fund_goods', g.fund_goods, 'owner_goods', g.owner_goods,
    'fund_fees', f.fund_fees, 'owner_fees', f.owner_fees,
    'capital_cash', (select coalesce(sum(amount_cents), 0) from public.capital_contributions where put_in_on <= p_to),
    'distributions', (select coalesce(sum(amount_cents), 0) from public.fund_releases where released_on <= p_to))
  from sales s, cogs c, diffs d, bought g, fees f, ex e
$$;

-- Derived figures from running totals (internal).
create function public.finance_derive(t jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  with v as (
    select (t ->> 'net')::numeric as net, (t ->> 'collected')::numeric as collected,
           (t ->> 'cogs')::numeric as cogs, (t ->> 'count_diffs')::numeric as diffs,
           (t ->> 'opex')::numeric as opex, (t ->> 'tax_paid')::numeric as tax_paid,
           round((t ->> 'net')::numeric * (t ->> 'tax_rate_bp')::numeric / 10000) as tax,
           (t ->> 'fund_goods')::numeric + (t ->> 'owner_goods')::numeric as goods,
           (t ->> 'fund_fees')::numeric + (t ->> 'owner_fees')::numeric as fees,
           (t ->> 'capital_cash')::numeric + (t ->> 'owner_goods')::numeric + (t ->> 'owner_fees')::numeric as capital,
           (t ->> 'capital_cash')::numeric as capital_cash,
           (t ->> 'fund_goods')::numeric as fund_goods, (t ->> 'fund_fees')::numeric as fund_fees,
           (t ->> 'distributions')::numeric as dist
  )
  select t || jsonb_build_object(
    'tax', tax,
    'net_profit', net - cogs + diffs - opex - tax,
    'cash', capital_cash + collected - fund_goods - fund_fees - opex - tax_paid - dist,
    'receivables', net - collected,
    'inventory', goods + fees - cogs + diffs,
    'capital', capital,
    'tax_payable', tax - tax_paid,
    'retained', net - cogs + diffs - opex - tax - dist)
  from v
$$;

-- Today's payout limit (internal): the lower of profit kept and spare cash.
create function public.finance_now()
returns jsonb
language sql stable set search_path = ''
as $$
  with t as (select public.finance_derive(public.finance_totals(public.manila_today())) as d),
       f as (select (public.funds_summary() ->> 'kept_cents')::numeric as kept)
  select jsonb_build_object(
    'cash', (d ->> 'cash')::numeric,
    'retained', (d ->> 'retained')::numeric,
    'tax_reserve', greatest(0, (d ->> 'tax_payable')::numeric),
    'inventory_reserve', f.kept,
    'spare_cash', (d ->> 'cash')::numeric - greatest(0, (d ->> 'tax_payable')::numeric) - f.kept,
    'safe_to_distribute', greatest(0, least((d ->> 'retained')::numeric,
                              (d ->> 'cash')::numeric - greatest(0, (d ->> 'tax_payable')::numeric) - f.kept)))
  from t, f
$$;

-- The Finance view: running totals at both ends of the period, receivables by age, today's payout
-- limit. Owners and managers.
create function public.finance_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can see the finances' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Pick a period' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'start', public.finance_derive(public.finance_totals(p_from - 1)),
    'end', public.finance_derive(public.finance_totals(p_to)),
    'now', public.finance_now(),
    'first_day', least(
      (select min(business_date) from public.sales),
      (select min((created_at at time zone 'Asia/Manila')::date) from public.stock_movements),
      (select min(put_in_on) from public.capital_contributions)),
    'receivables', coalesce((
      select jsonb_agg(jsonb_build_object('sale_id', id, 'customer_name', customer_name, 'cents', balance_cents,
                                          'days', public.manila_today() - business_date) order by business_date)
        from public.sales where status = 'completed' and balance_cents > 0), '[]'));
end;
$$;

-- ───────── Distributions: capped by profit and spare cash ─────────
create or replace function public.release_profits(p_amount_cents int, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id      uuid;
  v_safe    numeric;
  v_manager int;
  v_parts   int;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can release profits' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 1000000000 then
    raise exception 'Enter an amount from ₱0.01' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('fund_releases'));
  v_safe := (public.finance_now() ->> 'safe_to_distribute')::numeric;
  if p_amount_cents > v_safe then
    raise exception 'Only ₱% is safe to distribute (the lower of profit kept and spare cash)',
      to_char(v_safe / 100.0, 'FM999,999,990.00') using errcode = '22023';
  end if;
  select split_owner_parts + split_manager_parts, split_manager_parts into v_parts, v_manager from public.settings where id = 1;
  v_manager := round(p_amount_cents::numeric * v_manager / v_parts);
  insert into public.fund_releases (amount_cents, owner_cents, manager_cents, note)
  values (p_amount_cents, p_amount_cents - v_manager, v_manager, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.finance_totals(date) from public, anon, authenticated;
revoke execute on function public.finance_derive(jsonb) from public, anon, authenticated;
revoke execute on function public.finance_now() from public, anon, authenticated;
revoke execute on function public.finance_report(date, date) from public, anon;
grant execute on function public.finance_report(date, date) to authenticated;
revoke execute on function public.add_capital(bigint, text, date) from public, anon;
grant execute on function public.add_capital(bigint, text, date) to authenticated;
revoke execute on function public.delete_capital(uuid) from public, anon;
grant execute on function public.delete_capital(uuid) to authenticated;
revoke execute on function public.set_tax_rate(int) from public, anon;
grant execute on function public.set_tax_rate(int) to authenticated;
