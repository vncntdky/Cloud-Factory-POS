-- Company funds: you decide what to keep for the next restock, instead of a fixed reserve.
--   * fund_set_asides logs each decision ("keep ₱5,000 for the next restock"). The latest one counts.
--   * Batches paid from the fund that come in after a decision use it up automatically (their goods
--     plus restocking fees); what's left of it stays kept. Available to release = fund balance − kept.
--   * needs_decision: a batch came in since the last decision (or none was made yet), so the funds view
--     asks how much to keep for the next one.
-- Owners and managers decide; only the owner releases profit.

create table public.fund_set_asides (
  id           uuid primary key default gen_random_uuid(),
  amount_cents bigint not null check (amount_cents between 0 and 100000000000),
  note         text check (char_length(note) <= 200),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index fund_set_asides_created_by_idx on public.fund_set_asides (created_by);
create index fund_set_asides_created_at_idx on public.fund_set_asides (created_at desc);

alter table public.fund_set_asides enable row level security;
create policy "managers read fund_set_asides" on public.fund_set_asides
  for select to authenticated using ((select public.is_manager()));
revoke all on public.fund_set_asides from anon;
revoke insert, update, delete on public.fund_set_asides from authenticated;
grant select on public.fund_set_asides to authenticated;

-- Decide how much the fund keeps for the next restock. Owners and managers.
create function public.set_restock_set_aside(p_amount_cents bigint, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can decide the restock budget' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 100000000000 then
    raise exception 'Enter an amount of ₱0 or more' using errcode = '22023';
  end if;
  insert into public.fund_set_asides (amount_cents, note) values (p_amount_cents, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.set_restock_set_aside(bigint, text) from public, anon;
grant execute on function public.set_restock_set_aside(bigint, text) to authenticated;

create or replace function public.funds_summary()
returns jsonb
language sql stable set search_path = ''
as $$
  with sales as (
    select coalesce(sum(subtotal_cents), 0) as gross, coalesce(sum(discount_cents), 0) as discounts,
           coalesce(sum(total_cents), 0) as net, coalesce(sum(balance_cents), 0) as owed
      from public.sales where status = 'completed'
  ),
  by_method as (
    select method, sum(cents) as cents from (
      select s.payment_method::text as method, s.total_cents as cents
        from public.sales s where s.status = 'completed' and s.payment_method::text <> 'unpaid'
      union all
      select p.payment_method::text, p.amount_cents
        from public.sale_payments p join public.sales s on s.id = p.sale_id where s.status = 'completed'
    ) x group by method
  ),
  goods as (
    -- Stock paid from the funds: opening stock and restocks, in a batch marked so or not yet in one.
    select coalesce(sum(m.delta * m.unit_cost_cents), 0) as cents,
           count(*) filter (where m.unit_cost_cents is null) as uncosted
      from public.stock_movements m
      left join public.stock_batches b on b.id = m.batch_id
     where m.kind in ('opening', 'restock') and m.delta > 0 and (m.batch_id is null or b.paid_from_funds)
  ),
  fees as (
    select coalesce(sum(shipping_cents + tax_cents + mooe_cents + other_cents), 0) as cents
      from public.stock_batches where paid_from_funds
  ),
  -- Each batch paid from the fund, with its full cost (goods + restocking fees).
  paid as (
    select b.id, b.batch_no, b.received_on, b.created_at,
           b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents
           + coalesce((select sum(m.delta * m.unit_cost_cents) from public.stock_movements m
                        where m.batch_id = b.id and m.kind in ('opening', 'restock') and m.delta > 0), 0) as cents
      from public.stock_batches b
     where b.paid_from_funds
  ),
  latest as (select batch_no, cents from paid order by received_on desc, batch_no desc limit 1),
  -- The latest decision on what to keep for the next restock, and what batches since have used.
  decision as (select amount_cents, note, created_at from public.fund_set_asides order by created_at desc limit 1),
  since as (
    select coalesce(sum(p.cents), 0) as used, count(*) as batches
      from paid p where p.created_at > coalesce((select created_at from decision), '-infinity')
  ),
  t as (
    select s.gross, s.discounts, s.net, s.owed, s.net - s.owed as collected,
           g.cents as goods, g.uncosted, f.cents as fees,
           (select coalesce(sum(amount_cents), 0) from public.expenses) as expenses,
           (select coalesce(sum(amount_cents), 0) from public.fund_releases) as released,
           (select coalesce(sum(owner_cents), 0) from public.fund_releases) as owner_released,
           (select coalesce(sum(manager_cents), 0) from public.fund_releases) as manager_released,
           coalesce((select amount_cents from decision), 0) as set_aside,
           case when exists (select 1 from decision) then (select used from since) else 0 end as used,
           (select batches from since) as batches_since
      from sales s, goods g, fees f
  ),
  r as (select *, greatest(0, set_aside - used) as kept, collected - goods - fees - expenses - released as balance from t)
  select jsonb_build_object(
    'gross_cents', gross, 'discount_cents', discounts, 'net_cents', net, 'owed_cents', owed,
    'collected_cents', collected,
    'collected_by_method', coalesce((select jsonb_object_agg(method, cents) from by_method), '{}'),
    'goods_cents', goods, 'goods_uncosted', uncosted, 'restock_fees_cents', fees,
    'expenses_cents', expenses, 'released_cents', released,
    'owner_released_cents', owner_released, 'manager_released_cents', manager_released,
    'balance_cents', balance,
    'set_aside_cents', set_aside, 'set_aside_used_cents', least(used, set_aside), 'kept_cents', kept,
    'set_aside_at', (select created_at from decision), 'set_aside_note', (select note from decision),
    -- Ask for a decision when none was made yet, or a batch came in since the last one.
    'needs_decision', batches_since > 0,
    'last_batch_no', (select batch_no from latest), 'last_batch_cents', (select cents from latest),
    'available_cents', greatest(0, balance - kept))
  from r
$$;
revoke execute on function public.funds_summary() from public, anon, authenticated;
