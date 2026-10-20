-- Vape POS: the checked functions that change products and stock.

-- Internal: move on_hand and log it. Callers hold the product row lock.
create function public.move_stock(p_product uuid, p_kind text, p_delta int, p_sale uuid,
                                  p_unit_cost int, p_note text)
returns int
language plpgsql set search_path = ''
as $$
declare v_after int;
begin
  update public.products set on_hand = on_hand + p_delta, updated_at = now()
   where id = p_product
  returning on_hand into v_after;
  insert into public.stock_movements (product_id, kind, delta, on_hand_after, sale_id, unit_cost_cents, note)
  values (p_product, p_kind, p_delta, v_after, p_sale, p_unit_cost, nullif(btrim(p_note), ''));
  return v_after;
end;
$$;

-- ───────── Product editor (owners and managers) ─────────
-- p: {brand, name, variant, barcode, category_id, new_category, price_cents, cost_cents,
--     reorder_at, active, opening_qty (new products only)}
create function public.save_product(p_id uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_name    text := nullif(btrim(p ->> 'name'), '');
  v_cat     uuid := nullif(p ->> 'category_id', '')::uuid;
  v_new     text := nullif(btrim(p ->> 'new_category'), '');
  v_price   int  := (p ->> 'price_cents')::int;
  v_cost    int  := nullif(p ->> 'cost_cents', '')::int;
  v_reorder int  := coalesce(nullif(p ->> 'reorder_at', '')::int, 5);
  v_open    int  := coalesce(nullif(p ->> 'opening_qty', '')::int, 0);
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change products' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Add a product name' using errcode = '22023';
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'The price must be 0 or more' using errcode = '22023';
  end if;
  if v_cost is not null and v_cost < 0 then
    raise exception 'The cost can''t be negative' using errcode = '22023';
  end if;
  if v_reorder < 0 then
    raise exception 'The reorder level must be 0 or more' using errcode = '22023';
  end if;
  if v_open < 0 or v_open > 100000 then
    raise exception 'Opening stock must be between 0 and 100,000' using errcode = '22023';
  end if;

  if v_new is not null then
    select id into v_cat from public.categories where lower(name) = lower(v_new);
    if v_cat is null then
      insert into public.categories (name, sort_order)
      values (v_new, coalesce((select max(sort_order) + 1 from public.categories), 0))
      returning id into v_cat;
    end if;
  end if;

  if v_id is null then
    insert into public.products (category_id, brand, name, variant, barcode, price_cents, reorder_at, active)
    values (v_cat, nullif(btrim(p ->> 'brand'), ''), v_name, nullif(btrim(p ->> 'variant'), ''),
            nullif(btrim(p ->> 'barcode'), ''), v_price, v_reorder,
            coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
    if v_open > 0 then
      perform public.move_stock(v_id, 'opening', v_open, null, v_cost, null);
    end if;
  else
    update public.products set
      category_id = v_cat,
      brand       = nullif(btrim(p ->> 'brand'), ''),
      name        = v_name,
      variant     = nullif(btrim(p ->> 'variant'), ''),
      barcode     = nullif(btrim(p ->> 'barcode'), ''),
      price_cents = v_price,
      reorder_at  = v_reorder,
      active      = coalesce((p ->> 'active')::boolean, active),
      updated_at  = now()
    where id = v_id;
    if not found then
      raise exception 'That product no longer exists' using errcode = 'P0002';
    end if;
  end if;

  if v_cost is not null then
    insert into public.product_costs (product_id, cost_cents) values (v_id, v_cost)
    on conflict (product_id) do update set cost_cents = excluded.cost_cents, updated_at = now();
  elsif p ? 'cost_cents' then
    delete from public.product_costs where product_id = v_id;
  end if;

  return v_id;
end;
$$;

-- Count / restock / waste. Owners and managers.
--   count: qty is what's on the shelf now. restock: qty pieces received (optional cost per piece,
--   which becomes the product's cost). waste: qty pieces damaged, expired or lost.
create function public.adjust_stock(p_product uuid, p_kind text, p_qty int,
                                    p_unit_cost_cents int default null, p_note text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_on_hand int;
  v_delta   int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change stock' using errcode = '42501';
  end if;
  if p_kind not in ('count', 'restock', 'waste') then
    raise exception 'Unknown stock change' using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 then
    raise exception 'Enter a number of pieces from 0 to 100,000' using errcode = '22023';
  end if;
  if p_kind <> 'count' and p_qty = 0 then
    raise exception 'Enter at least 1 piece' using errcode = '22023';
  end if;
  if p_unit_cost_cents is not null and p_unit_cost_cents < 0 then
    raise exception 'The cost can''t be negative' using errcode = '22023';
  end if;

  select on_hand into v_on_hand from public.products where id = p_product for update;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  v_delta := case p_kind when 'count' then p_qty - v_on_hand
                         when 'restock' then p_qty
                         else -p_qty end;
  -- A count that matches is still logged: "counted, matched" is useful history.

  if p_kind = 'restock' and p_unit_cost_cents is not null then
    insert into public.product_costs (product_id, cost_cents) values (p_product, p_unit_cost_cents)
    on conflict (product_id) do update set cost_cents = excluded.cost_cents, updated_at = now();
  end if;

  return public.move_stock(p_product, p_kind, v_delta, null,
                           case when p_kind = 'restock' then p_unit_cost_cents end, p_note);
end;
$$;
