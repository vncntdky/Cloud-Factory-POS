-- Vape POS: checkout.

-- ───────── Checkout ─────────
-- p: {client_ref, items: [{product_id, quantity}], discount_cents, payment_method,
--     tendered_cents (cash), reference (GCash / Maya / card ref), age_verified, note}
-- Prices and costs come from the database, never the register. Returns {id, sale_number, total_cents, change_cents}.
create function public.complete_sale(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref       uuid := nullif(p ->> 'client_ref', '')::uuid;
  v_method    public.payment_method;
  v_discount  int := coalesce(nullif(p ->> 'discount_cents', '')::int, 0);
  v_tendered  int := nullif(p ->> 'tendered_cents', '')::int;
  v_settings  public.settings;
  v_existing  public.sales;
  v_sale      uuid;
  v_number    int;
  v_subtotal  int := 0;
  v_total     int;
  v_change    int;
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
                              'repeat', true);
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

  insert into public.sales (client_ref, subtotal_cents, discount_cents, total_cents, payment_method,
                            tendered_cents, change_cents, reference, age_verified, note)
  values (v_ref, v_subtotal, v_discount, v_total, v_method, v_tendered, v_change,
          left(nullif(btrim(p ->> 'reference'), ''), 60), true, left(nullif(btrim(p ->> 'note'), ''), 300))
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

  return jsonb_build_object('id', v_sale, 'sale_number', v_number, 'total_cents', v_total, 'change_cents', v_change);
end;
$$;
