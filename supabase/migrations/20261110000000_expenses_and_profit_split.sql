-- P&L on the dashboard: expenses (salaries, rent, utilities, supplies, other) and how net profit is
-- split between the owner and the manager (2 : 1 to start). Owners and managers record expenses;
-- only the owner changes the split.

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  spent_on      date not null default public.manila_today(),
  category      text not null check (category in ('salary', 'rent', 'utilities', 'supplies', 'other')),
  amount_cents  int not null check (amount_cents between 1 and 100000000),
  note          text check (char_length(note) <= 200),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index expenses_spent_on_idx on public.expenses (spent_on);
create index expenses_created_by_idx on public.expenses (created_by);

alter table public.expenses enable row level security;
create policy "managers read expenses" on public.expenses
  for select to authenticated using ((select public.is_manager()));
revoke all on public.expenses from anon;
revoke insert, update, delete on public.expenses from authenticated;
grant select on public.expenses to authenticated;

-- p: {spent_on, category, amount_cents, note}
create function public.add_expense(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id     uuid;
  v_date   date := coalesce(nullif(p ->> 'spent_on', '')::date, public.manila_today());
  v_amount int := nullif(p ->> 'amount_cents', '')::int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can record expenses' using errcode = '42501';
  end if;
  if coalesce(p ->> 'category', '') not in ('salary', 'rent', 'utilities', 'supplies', 'other') then
    raise exception 'Pick what the expense was for' using errcode = '22023';
  end if;
  if v_amount is null or v_amount not between 1 and 100000000 then
    raise exception 'Enter an amount from ₱0.01 to ₱1,000,000' using errcode = '22023';
  end if;
  if v_date > public.manila_today() or v_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  insert into public.expenses (spent_on, category, amount_cents, note)
  values (v_date, p ->> 'category', v_amount, nullif(btrim(p ->> 'note'), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.delete_expense(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can remove expenses' using errcode = '42501';
  end if;
  delete from public.expenses where id = p_id;
  if not found then
    raise exception 'That expense no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- ───────── Profit split ─────────
-- Net profit is shared owner : manager in these parts (2 : 1 = two thirds and one third).
alter table public.settings
  add column split_owner_parts   int not null default 2 check (split_owner_parts between 0 and 100),
  add column split_manager_parts int not null default 1 check (split_manager_parts between 0 and 100),
  add constraint settings_split_not_empty check (split_owner_parts + split_manager_parts > 0);

create function public.set_profit_split(p_owner_parts int, p_manager_parts int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change the profit split' using errcode = '42501';
  end if;
  if p_owner_parts is null or p_manager_parts is null or p_owner_parts not between 0 and 100
     or p_manager_parts not between 0 and 100 or p_owner_parts + p_manager_parts = 0 then
    raise exception 'Use whole parts from 0 to 100, e.g. 2 and 1' using errcode = '22023';
  end if;
  update public.settings set split_owner_parts = p_owner_parts, split_manager_parts = p_manager_parts,
                             updated_at = now()
   where id = 1;
end;
$$;

revoke execute on function public.add_expense(jsonb) from public, anon;
grant execute on function public.add_expense(jsonb) to authenticated;
revoke execute on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;
revoke execute on function public.set_profit_split(int, int) from public, anon;
grant execute on function public.set_profit_split(int, int) to authenticated;
