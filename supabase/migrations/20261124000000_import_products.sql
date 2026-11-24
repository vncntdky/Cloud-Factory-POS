-- Vape POS: add many products at once from a CSV file (Inventory → Import CSV). Owners and managers only.
--
-- import_products(p_rows, p_commit) takes the file's rows as text, exactly as typed:
--   [{"row_no": 2, "category": "Black TEO", "brand": "Black TEO", "name": "Very Chill", "variant": "",
--     "barcode": "", "price": "₱340", "cost": "165", "reorder_at": "5", "for_sale": "yes"}, …]
-- and answers one line per row: status 'new' (will be added), 'exists' (a product with the same brand,
-- product and flavour is already in the app: skipped, never changed), 'example' (a template example row,
-- category or brand "Example": skipped) or 'error' (with what to fix).
-- With p_commit = false nothing is written: it is the preview. With p_commit = true every 'new' row is added
-- through save_product (so its rules apply), new categories are made, and the product ids come back; if any
-- row has an error nothing is added at all. Pieces are not imported: stock comes in with Receive batch.

create or replace function public.import_products(p_rows jsonb, p_commit boolean default false)
returns table (row_no int, status text, message text, product_id uuid)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r         jsonb;
  v_no      int;
  v_cat     text;
  v_brand   text;
  v_name    text;
  v_variant text;
  v_barcode text;
  v_txt     text;
  v_price   numeric;
  v_cost    numeric;
  v_reorder numeric;
  v_active  boolean;
  v_key     text;
  v_errors  int := 0;
  v_err     text;
  v_status  text;
  v_existing record;
  v_keys    jsonb := '{}';  -- product key → first row number with it
  v_codes   jsonb := '{}';  -- barcode → first row number with it
  v_out     jsonb := '[]';  -- one object per row, in file order
  v_item    jsonb;
  v_id      uuid;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can add products' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no products in it' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Import up to 500 products at a time' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_no      := coalesce(nullif(r ->> 'row_no', '')::int, 0);
    v_cat     := nullif(btrim(coalesce(r ->> 'category', '')), '');
    v_brand   := nullif(btrim(coalesce(r ->> 'brand', '')), '');
    v_name    := nullif(btrim(coalesce(r ->> 'name', '')), '');
    v_variant := nullif(btrim(coalesce(r ->> 'variant', '')), '');
    v_barcode := nullif(btrim(coalesce(r ->> 'barcode', '')), '');
    v_err     := null;
    v_status  := 'new';
    v_price   := null;
    v_cost    := null;
    v_reorder := 5;
    v_active  := true;

    -- Template example rows are skipped, whatever else they hold.
    if lower(coalesce(v_cat, '')) = 'example' or lower(coalesce(v_brand, '')) = 'example' then
      v_out := v_out || jsonb_build_object('row_no', v_no, 'status', 'example', 'message', 'Example row: skipped');
      continue;
    end if;

    -- Money: "340", "₱1,250.50", "PHP 340" → centavos.
    v_txt := regexp_replace(coalesce(r ->> 'price', ''), 'php|[₱,[:space:]]', '', 'gi');
    if v_txt ~ '^\d{1,7}(\.\d{1,2})?$' then v_price := round(v_txt::numeric * 100); end if;
    v_txt := regexp_replace(coalesce(r ->> 'cost', ''), 'php|[₱,[:space:]]', '', 'gi');
    if v_txt ~ '^\d{1,7}(\.\d{1,2})?$' then v_cost := round(v_txt::numeric * 100);
    elsif v_txt <> '' then v_err := 'Enter the cost per piece in pesos, e.g. 165, or leave it empty.';
    end if;
    v_txt := regexp_replace(coalesce(r ->> 'reorder_at', ''), '[,[:space:]]', '', 'g');
    if v_txt ~ '^\d{1,5}$' then v_reorder := v_txt::numeric;
    elsif v_txt <> '' then v_err := 'Low-stock alert must be a whole number of pieces, e.g. 5.';
    end if;
    v_txt := lower(btrim(coalesce(r ->> 'for_sale', '')));
    if v_txt in ('', 'yes', 'y', 'true', '1', 'oo') then v_active := true;
    elsif v_txt in ('no', 'n', 'false', '0', 'hindi') then v_active := false;
    else v_err := 'For sale must be yes or no.';
    end if;

    if v_name is null then v_err := 'Add the product name.';
    elsif char_length(v_name) > 80 then v_err := 'The product name is longer than 80 letters.';
    elsif v_price is null then v_err := 'Enter the selling price in pesos, e.g. 340.';
    elsif v_price > 10000000 then v_err := 'The selling price looks too high (over ₱100,000).';
    elsif v_cost > 10000000 then v_err := 'The cost looks too high (over ₱100,000).';
    elsif v_reorder > 10000 then v_err := 'Low-stock alert must be 10,000 pieces or fewer.';
    elsif char_length(coalesce(v_brand, '')) > 60 then v_err := 'The brand is longer than 60 letters.';
    elsif char_length(coalesce(v_variant, '')) > 60 then v_err := 'The flavour / variant is longer than 60 letters.';
    elsif char_length(coalesce(v_cat, '')) > 40 then v_err := 'The category is longer than 40 letters.';
    end if;

    v_key := lower(coalesce(v_brand, '')) || '|' || lower(coalesce(v_name, '')) || '|' || lower(coalesce(v_variant, ''));
    if v_err is null then
      select p.id, p.active into v_existing
        from public.products p
       where lower(coalesce(btrim(p.brand), '')) = lower(coalesce(v_brand, ''))
         and lower(btrim(p.name)) = lower(v_name)
         and lower(coalesce(btrim(p.variant), '')) = lower(coalesce(v_variant, ''))
       limit 1;
      if found then
        v_status := 'exists';
      elsif v_keys ? v_key then
        v_err := format('Same product as row %s.', v_keys ->> v_key);
      elsif v_barcode is not null and v_barcode !~ '^[A-Za-z0-9._-]{1,40}$' then
        v_err := 'Barcodes use letters, numbers, . - and _ only (up to 40).';
      elsif v_barcode is not null and exists (select 1 from public.products p where p.barcode = v_barcode) then
        v_err := format('Another product already has barcode %s.', v_barcode);
      elsif v_barcode is not null and v_codes ? v_barcode then
        v_err := format('Barcode %s is on row %s too.', v_barcode, v_codes ->> v_barcode);
      end if;
    end if;

    if v_err is not null then
      v_errors := v_errors + 1;
      v_out := v_out || jsonb_build_object('row_no', v_no, 'status', 'error', 'message', v_err);
    elsif v_status = 'exists' then
      v_out := v_out || jsonb_build_object('row_no', v_no, 'status', 'exists',
        'message', case when v_existing.active then 'Already in the app: skipped' else 'Already in the app (Not for sale): skipped' end,
        'product_id', v_existing.id);
    else
      v_keys := v_keys || jsonb_build_object(v_key, v_no);
      if v_barcode is not null then v_codes := v_codes || jsonb_build_object(v_barcode, v_no); end if;
      v_out := v_out || jsonb_build_object('row_no', v_no, 'status', 'new', 'message', null,
        'p', jsonb_build_object('brand', coalesce(v_brand, ''), 'name', v_name, 'variant', coalesce(v_variant, ''),
                                'barcode', coalesce(v_barcode, ''), 'new_category', coalesce(v_cat, ''), 'category_id', '',
                                'price_cents', v_price, 'reorder_at', v_reorder, 'active', v_active, 'opening_qty', 0)
             || case when v_cost is null then '{}'::jsonb else jsonb_build_object('cost_cents', v_cost) end);
    end if;
  end loop;

  if p_commit and v_errors > 0 then
    raise exception 'Nothing was added: fix the % row(s) marked with an error, then upload the file again', v_errors
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(v_out) loop
    v_id := nullif(v_item ->> 'product_id', '')::uuid;
    if p_commit and v_item ->> 'status' = 'new' then
      v_id := public.save_product(null, v_item -> 'p');
    end if;
    row_no := (v_item ->> 'row_no')::int;
    status := v_item ->> 'status';
    message := v_item ->> 'message';
    product_id := v_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.import_products(jsonb, boolean) from public, anon;
grant execute on function public.import_products(jsonb, boolean) to authenticated;
