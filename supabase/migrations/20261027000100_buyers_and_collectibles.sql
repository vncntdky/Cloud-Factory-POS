-- Vape POS: buyer names, sales on credit ("Not paid yet") and collecting what's owed.

-- Product photos show on every register tile; a public bucket lets the browser cache them.
-- Uploading, replacing and removing stay staff-only (policies on storage.objects).
update storage.buckets set public = true where id = 'product-photos';

-- ───────── Buyer and balance on each sale ─────────
alter table public.sales
  add column customer_name text check (char_length(btrim(customer_name)) between 1 and 80),
  add column balance_cents int not null default 0 check (balance_cents >= 0 and balance_cents <= total_cents),
  add constraint sales_unpaid_needs_buyer check (payment_method <> 'unpaid' or customer_name is not null);
create index sales_open_balance_idx on public.sales (business_date, sale_number) where balance_cents > 0;

-- ───────── Money collected on an unpaid sale ─────────
create table public.sale_payments (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references public.sales (id) on delete cascade,
  amount_cents    int not null check (amount_cents > 0),
  payment_method  public.payment_method not null check (payment_method <> 'unpaid'),
  reference       text check (char_length(reference) <= 60),
  business_date   date not null default public.manila_today(),   -- the day the money came in
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index sale_payments_sale_idx on public.sale_payments (sale_id);
create index sale_payments_date_idx on public.sale_payments (business_date);
create index sale_payments_created_by_idx on public.sale_payments (created_by);

alter table public.sale_payments enable row level security;
-- Same as the sale it belongs to: staff see today's sales, owners and managers every day.
create policy "staff read sale_payments" on public.sale_payments
  for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
revoke all on public.sale_payments from anon;
revoke all on public.sale_payments from authenticated;
grant select on public.sale_payments to authenticated;

-- ───────── Checkout ─────────
-- p: {client_ref, items: [{product_id, quantity}], discount_cents, payment_method,
--     tendered_cents (cash), reference (GCash / Maya / card ref), age_verified, note, customer_name}
-- payment_method 'unpaid' needs customer_name; the whole total is owed (balance_cents).
-- Returns {id, sale_number, total_cents, change_cents, balance_cents}.
create or replace function public.complete_sale(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref       uuid := nullif(p ->> 'client_ref', '')::uuid;
  v_method    public.payment_method;
  v_discount  int := coalesce(nullif(p ->> 'discount_cents', '')::int, 0);
  v_tendered  int := nullif(p ->> 'tendered_cents', '')::int;
  v_buyer     text := nullif(btrim(p ->> 'customer_name'), '');
  v_settings  public.settings;
  v_existing  public.sales;
  v_sale      uuid;
  v_number    int;
  v_subtotal  int := 0;
  v_total     int;
  v_change    int;
  v_balance   int := 0;
  v_lines     jsonb := '[]'::jsonb;
  r           record;
begin
  if not public.is_staff() then
    raise exception 'Your account isn''t active' using errcode = '42501';
  end if;
  if v_ref is null then
    raise exception 'Missing sale reference' using errcode = '22023';
  end if;

  -- Same tap sent twice (slow connection): return the sale already made.
  select * into v_existing from public.sales where client_ref = v_ref;
  if found then
    return jsonb_build_object('id', v_existing.id, 'sale_number', v_existing.sale_number,
                              'total_cents', v_existing.total_cents, 'change_cents', v_existing.change_cents,
                              'balance_cents', v_existing.balance_cents, 'repeat', true);
  end if;

  if coalesce((p ->> 'age_verified')::boolean, false) is not true then
    raise exception 'Check the customer''s ID before completing the sale' using errcode = '22023';
  end if;
  begin
    v_method := (p ->> 'payment_method')::public.payment_method;
  exception when others then
    raise exception 'Pick how the customer paid' using errcode = '22023';
  end;
  if v_method is null then
    raise exception 'Pick how the customer paid' using errcode = '22023';
  end if;
  if char_length(v_buyer) > 80 then
    raise exception 'Keep the buyer''s name to 80 characters' using errcode = '22023';
  end if;
  if v_method = 'unpaid' and v_buyer is null then
    raise exception 'Add the buyer''s name so you know who to collect from' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Add at least one item' using errcode = '22023';
  end if;
  if v_discount < 0 then
    raise exception 'The discount can''t be negative' using errcode = '22023';
  end if;

  select * into v_settings from public.settings where id = 1;

  -- Merge repeated products, lock them in a fixed order (so two registers can't deadlock), then
  -- price the cart from the database.
  perform 1 from public.products
   where id in (select (i ->> 'product_id')::uuid from jsonb_array_elements(p -> 'items') i)
   order by id
     for update;

  for r in
    select c.product_id, c.quantity, pr.id is not null as found, pr.on_hand, pr.price_cents, pr.active,
           concat_ws(' ', pr.brand, pr.name) || coalesce(' · ' || pr.variant, '') as label,
           pc.cost_cents
      from (select (i ->> 'product_id')::uuid as product_id, sum((i ->> 'quantity')::int)::int as quantity
              from jsonb_array_elements(p -> 'items') i
             group by 1) c
      left join public.products pr on pr.id = c.product_id
      left join public.product_costs pc on pc.product_id = c.product_id
     order by c.product_id
  loop
    if r.quantity is null or r.quantity <= 0 or r.quantity > 1000 then
      raise exception 'Each quantity must be between 1 and 1,000' using errcode = '22023';
    end if;
    if not r.found then
      raise exception 'An item in the cart no longer exists. Remove it and try again' using errcode = 'P0002';
    end if;
    if not r.active then
      raise exception '% is no longer for sale', r.label using errcode = '22023';
    end if;
    if r.quantity > r.on_hand and not v_settings.allow_negative_stock then
      raise exception 'Only % left of %. Count it in Inventory if the shelf has more', greatest(r.on_hand, 0), r.label
        using errcode = '22023';
    end if;
    v_lines := v_lines || jsonb_build_object('product_id', r.product_id, 'quantity', r.quantity, 'name', r.label,
                                             'price', r.price_cents, 'cost', r.cost_cents);
    v_subtotal := v_subtotal + r.price_cents * r.quantity;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'The discount can''t be more than the subtotal' using errcode = '22023';
  end if;
  if v_discount > v_settings.staff_discount_limit_cents and not public.is_manager() then
    raise exception 'Discounts over ₱% need an owner or manager', (v_settings.staff_discount_limit_cents / 100.0)::numeric(12, 2)
      using errcode = '42501';
  end if;
  v_total := v_subtotal - v_discount;

  if v_method = 'cash' then
    v_tendered := coalesce(v_tendered, v_total);
    if v_tendered < v_total then
      raise exception 'Cash received is less than the total' using errcode = '22023';
    end if;
    v_change := v_tendered - v_total;
  else
    v_tendered := null;
    v_change := null;
  end if;
  if v_method = 'unpaid' then
    v_balance := v_total;
  end if;

  insert into public.sales (client_ref, subtotal_cents, discount_cents, total_cents, payment_method,
                            tendered_cents, change_cents, reference, age_verified, note, customer_name, balance_cents)
  values (v_ref, v_subtotal, v_discount, v_total, v_method, v_tendered, v_change,
          case when v_method = 'unpaid' then null else left(nullif(btrim(p ->> 'reference'), ''), 60) end,
          true, left(nullif(btrim(p ->> 'note'), ''), 300), v_buyer, v_balance)
  returning id, sale_number into v_sale, v_number;

  insert into public.sale_items (sale_id, product_id, name, unit_price_cents, unit_cost_cents, quantity, line_total_cents)
  select v_sale, l.product_id, l.name, l.price, l.cost, l.quantity, l.price * l.quantity
    from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity int, name text, price int, cost int)
   order by l.name;

  for r in select l.product_id, l.quantity
             from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity int)
            order by l.product_id loop
    perform public.move_stock(r.product_id, 'sale', -r.quantity, v_sale, null, null);
  end loop;

  return jsonb_build_object('id', v_sale, 'sale_number', v_number, 'total_cents', v_total,
                            'change_cents', v_change, 'balance_cents', v_balance);
end;
$$;

-- ───────── Void ─────────
-- As before, and a voided sale is no longer owed.
create or replace function public.void_sale(p_sale uuid, p_reason text)
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
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = left(btrim(p_reason), 200),
         balance_cents = 0
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

-- ───────── Collecting ─────────
-- Money received for an unpaid sale, in full or in part. Any active staff member: they take the
-- money at the counter. The payment counts on the day it's received.
create function public.record_payment(p_sale uuid, p_amount_cents int, p_method public.payment_method, p_reference text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales;
begin
  if not public.is_staff() then
    raise exception 'Your account isn''t active' using errcode = '42501';
  end if;
  if p_method is null or p_method = 'unpaid' then
    raise exception 'Pick how the buyer paid' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter the amount received' using errcode = '22023';
  end if;
  select * into v_sale from public.sales where id = p_sale for update;
  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;
  if v_sale.status = 'voided' then
    raise exception 'This sale was voided, so nothing is owed' using errcode = '22023';
  end if;
  if v_sale.balance_cents <= 0 then
    raise exception 'This sale is already paid in full' using errcode = '22023';
  end if;
  if p_amount_cents > v_sale.balance_cents then
    raise exception 'That''s more than the ₱% still owed', (v_sale.balance_cents / 100.0)::numeric(12, 2)
      using errcode = '22023';
  end if;

  insert into public.sale_payments (sale_id, amount_cents, payment_method, reference)
  values (p_sale, p_amount_cents, p_method,
          case when p_method = 'cash' then null else left(nullif(btrim(p_reference), ''), 60) end);
  update public.sales set balance_cents = balance_cents - p_amount_cents where id = p_sale;

  return jsonb_build_object('balance_cents', v_sale.balance_cents - p_amount_cents);
end;
$$;

-- Every sale with money still owed, oldest first. All active staff get this list, including days
-- whose sales are otherwise hidden from them, because they collect at the counter.
create function public.collectibles()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when public.is_staff() then coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'sale_number', s.sale_number,
           'business_date', s.business_date,
           'created_at', s.created_at,
           'customer_name', s.customer_name,
           'total_cents', s.total_cents,
           'balance_cents', s.balance_cents,
           'items', (select coalesce(jsonb_agg(jsonb_build_object('name', si.name, 'quantity', si.quantity) order by si.name), '[]'::jsonb)
                       from public.sale_items si where si.sale_id = s.id)
         ) order by s.business_date, s.sale_number), '[]'::jsonb) end
    from public.sales s
   where s.status = 'completed' and s.balance_cents > 0
$$;

-- ───────── Reports ─────────
-- As before, plus 'collected': money received in the range for earlier unpaid sales, by method.
-- Unpaid sales show in by_method under 'unpaid'.
create or replace function public.sales_summary(p_from date, p_to date)
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
  ), paid as (
    select * from public.sale_payments where business_date between p_from and p_to
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
    'collected',      (select coalesce(jsonb_object_agg(payment_method, jsonb_build_object('count', n, 'cents', c)), '{}'::jsonb)
                         from (select payment_method, count(*) n, sum(amount_cents) c from paid group by 1) m),
    'cogs_cents',     case when v_mgr then (select coalesce(sum(unit_cost_cents * quantity), 0) from items) end,
    'uncosted_lines', case when v_mgr then (select count(*) from items where unit_cost_cents is null) end,
    'top',            (select coalesce(jsonb_agg(t order by t.qty desc, t.cents desc), '[]'::jsonb) from (
                         select name, sum(quantity)::int qty, sum(line_total_cents)::int cents
                           from items group by name order by 2 desc, 3 desc limit 10) t)
  ) into v_out;
  return v_out;
end;
$$;

-- ───────── Function rights ─────────
revoke execute on function public.record_payment(uuid, int, public.payment_method, text) from public, anon;
grant execute on function public.record_payment(uuid, int, public.payment_method, text) to authenticated;
revoke execute on function public.collectibles() from public, anon;
grant execute on function public.collectibles() to authenticated;
