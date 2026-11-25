-- Vape POS: change the date a batch arrived from its report (Sales → Finance → Report) as well as its page.
--
-- * set_batch_received_on(p_batch, p_date): owners and managers, like update_batch_details. Only the date
--   changes; the supplier and note stay as they are.
-- * Both refuse a date after the day the batch's first piece was recorded in the app: the pieces can't be on the
--   shelf before the batch arrived. (Batches made from earlier stock take that day already.) update_batch_details
--   checks this only when the date changes, so a supplier or note can always be saved.
-- The other rules are unchanged: not in the future, not more than 400 days ago.

-- The Manila date the batch's first piece was recorded (null for a batch with no pieces yet).
create function public.batch_first_recorded(p_batch uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select min(m.created_at at time zone 'Asia/Manila')::date
    from public.stock_movements m
   where m.batch_id = p_batch and m.kind in ('opening', 'restock') and m.delta > 0
$$;

create function public.set_batch_received_on(p_batch uuid, p_date date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_no    int;
  v_first date;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  select batch_no into v_no from public.stock_batches where id = p_batch;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  if p_date is null or p_date > public.manila_today() or p_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  v_first := public.batch_first_recorded(p_batch);
  if v_first is not null and p_date > v_first then
    raise exception 'Batch %''s pieces were recorded on %, so it can''t have arrived later. Pick that day or earlier.',
      v_no, to_char(v_first, 'FMDD Mon') using errcode = '22023';
  end if;
  update public.stock_batches set received_on = p_date where id = p_batch;
end;
$$;

create or replace function public.update_batch_details(p_batch uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_date  date := nullif(p ->> 'received_on', '')::date;
  v_was   date;
  v_no    int;
  v_first date;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  if v_date is null or v_date > public.manila_today() or v_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  select received_on, batch_no into v_was, v_no from public.stock_batches where id = p_batch;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  if v_date is distinct from v_was then
    v_first := public.batch_first_recorded(p_batch);
    if v_first is not null and v_date > v_first then
      raise exception 'Batch %''s pieces were recorded on %, so it can''t have arrived later. Pick that day or earlier.',
        v_no, to_char(v_first, 'FMDD Mon') using errcode = '22023';
    end if;
  end if;
  update public.stock_batches
     set supplier = nullif(btrim(p ->> 'supplier'), ''), received_on = v_date, note = nullif(btrim(p ->> 'note'), '')
   where id = p_batch;
end;
$$;

revoke all on function public.batch_first_recorded(uuid) from public, anon, authenticated;
revoke all on function public.set_batch_received_on(uuid, date) from public, anon;
grant execute on function public.set_batch_received_on(uuid, date) to authenticated;
revoke execute on function public.update_batch_details(uuid, jsonb) from public, anon;
grant execute on function public.update_batch_details(uuid, jsonb) to authenticated;
