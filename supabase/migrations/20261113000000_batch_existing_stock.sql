-- Turn "Stock before batches" (opening stock and single restocks recorded outside a batch) into a
-- real batch, so it can carry restock costs and expenses and gets its own P&L. Owners and managers.
-- p: {supplier, note} (both optional). The batch is dated the day the oldest of that stock came in.
create function public.batch_existing_stock(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch uuid;
  v_no    int;
  v_first timestamptz;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can make batches' using errcode = '42501';
  end if;
  select min(created_at) into v_first
    from public.stock_movements
   where batch_id is null and kind in ('opening', 'restock') and delta > 0;
  if v_first is null then
    raise exception 'All stock is already in a batch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('stock_batches.batch_no'));
  select coalesce(max(batch_no), 0) + 1 into v_no from public.stock_batches;
  insert into public.stock_batches (batch_no, supplier, received_on, note)
  values (v_no, nullif(btrim(p ->> 'supplier'), ''), (v_first at time zone 'Asia/Manila')::date,
          coalesce(nullif(btrim(p ->> 'note'), ''), 'Opening stock'))
  returning id into v_batch;

  update public.stock_movements set batch_id = v_batch
   where batch_id is null and kind in ('opening', 'restock') and delta > 0;
  return v_batch;
end;
$$;

revoke execute on function public.batch_existing_stock(jsonb) from public, anon;
grant execute on function public.batch_existing_stock(jsonb) to authenticated;
