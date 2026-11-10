-- Edit what was entered, instead of only adding or removing it.
--   * update_expense: owners and managers (same rules as add_expense).
--   * update_capital: owner. Amount, date, note of money put in.
--   * update_fund_release: owner. Amount, date, note of a distribution; the split is redone at
--     today's split, and a bigger amount must still fit within what's safe to distribute.
--   * update_batch_details: owners and managers. A batch's supplier, date received and note.

create function public.update_expense(p_id uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch  uuid := nullif(p ->> 'batch_id', '')::uuid;
  v_date   date := nullif(p ->> 'spent_on', '')::date;
  v_amount int := nullif(p ->> 'amount_cents', '')::int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change expenses' using errcode = '42501';
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
  if v_date is null or v_date > public.manila_today() or v_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  update public.expenses
     set batch_id = v_batch, spent_on = v_date, category = p ->> 'category', amount_cents = v_amount,
         note = nullif(btrim(p ->> 'note'), '')
   where id = p_id;
  if not found then
    raise exception 'That expense no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

create function public.update_capital(p_id uuid, p_amount_cents bigint, p_note text default null, p_put_in_on date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can record capital' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 100000000000 then
    raise exception 'Enter an amount from ₱0.01' using errcode = '22023';
  end if;
  if p_put_in_on is null or p_put_in_on > public.manila_today() or p_put_in_on < public.manila_today() - 3650 then
    raise exception 'The date can''t be in the future' using errcode = '22023';
  end if;
  update public.capital_contributions
     set amount_cents = p_amount_cents, note = nullif(btrim(p_note), ''), put_in_on = p_put_in_on
   where id = p_id;
  if not found then
    raise exception 'That entry no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

create function public.update_fund_release(p_id uuid, p_amount_cents int, p_note text default null, p_released_on date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old     int;
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
  if p_released_on is null or p_released_on > public.manila_today() or p_released_on < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('fund_releases'));
  select amount_cents into v_old from public.fund_releases where id = p_id for update;
  if not found then
    raise exception 'That distribution no longer exists' using errcode = 'P0002';
  end if;
  -- Today's limit already has this distribution taken out: it may grow by at most that limit.
  v_safe := (public.finance_now() ->> 'safe_to_distribute')::numeric;
  if p_amount_cents > v_old + v_safe then
    raise exception 'Only ₱% is safe to distribute (the lower of profit kept and spare cash)',
      to_char((v_old + v_safe) / 100.0, 'FM999,999,990.00') using errcode = '22023';
  end if;
  select split_owner_parts + split_manager_parts, split_manager_parts into v_parts, v_manager from public.settings where id = 1;
  v_manager := round(p_amount_cents::numeric * v_manager / v_parts);
  update public.fund_releases
     set amount_cents = p_amount_cents, owner_cents = p_amount_cents - v_manager, manager_cents = v_manager,
         note = nullif(btrim(p_note), ''), released_on = p_released_on
   where id = p_id;
end;
$$;

create function public.update_batch_details(p_batch uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_date date := nullif(p ->> 'received_on', '')::date;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  if v_date is null or v_date > public.manila_today() or v_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  update public.stock_batches
     set supplier = nullif(btrim(p ->> 'supplier'), ''), received_on = v_date, note = nullif(btrim(p ->> 'note'), '')
   where id = p_batch;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.update_expense(uuid, jsonb) from public, anon;
grant execute on function public.update_expense(uuid, jsonb) to authenticated;
revoke execute on function public.update_capital(uuid, bigint, text, date) from public, anon;
grant execute on function public.update_capital(uuid, bigint, text, date) to authenticated;
revoke execute on function public.update_fund_release(uuid, int, text, date) from public, anon;
grant execute on function public.update_fund_release(uuid, int, text, date) to authenticated;
revoke execute on function public.update_batch_details(uuid, jsonb) from public, anon;
grant execute on function public.update_batch_details(uuid, jsonb) to authenticated;
