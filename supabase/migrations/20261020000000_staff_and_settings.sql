-- Vape POS: counter sales and per-piece inventory.
--
-- Roles (staff_role):
--   owner    everything, including settings and staff.
--   manager  runs the shop: products, prices, costs, stock, all sales, voids, any discount.
--   cashier  "Staff": sells, sees today's sales, discount up to settings.staff_discount_limit_cents.
--
-- Money is in centavos (₱350.00 = 35000). Stock is whole pieces.
-- Sales and stock only change through the SECURITY DEFINER functions below, which check the
-- caller's role and the business rules; staff can't write those tables through the API.

-- ───────── Staff ─────────

create type public.staff_role as enum ('owner', 'manager', 'cashier');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.staff_role not null default 'cashier',
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- New sign-ups start inactive. The very first account becomes the active owner, so the shop
-- can be set up without running SQL.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('first_owner'));
  v_first := not exists (select 1 from public.profiles);
  insert into public.profiles (id, full_name, role, active)
  values (new.id,
          left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80),
          case when v_first then 'owner'::public.staff_role else 'cashier'::public.staff_role end,
          v_first);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.my_role()
returns public.staff_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create function public.is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.my_role() in ('owner', 'manager'), false)
$$;

create function public.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.my_role() = 'owner', false)
$$;

create function public.manila_today()
returns date
language sql stable set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

-- Never lose the last active owner.
create function public.keep_an_owner()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.role = 'owner' and old.active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.active)
     and not exists (select 1 from public.profiles
                      where id <> old.id and role = 'owner' and active) then
    raise exception 'There must always be at least one active owner' using errcode = '22023';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_keep_an_owner
  before update or delete on public.profiles
  for each row execute function public.keep_an_owner();

alter table public.profiles enable row level security;
create policy "read own or staff profiles" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "owner updates profiles" on public.profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (role, active, full_name) on public.profiles to authenticated;

-- Staff list with sign-in emails, so the owner can tell who signed up.
create function public.staff_accounts()
returns table (id uuid, full_name text, role public.staff_role, active boolean,
               email text, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.role, p.active, u.email::text, p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.is_owner()
   order by p.active, p.created_at desc
$$;

-- ───────── Settings (one row) ─────────

create table public.settings (
  id                          int primary key default 1 check (id = 1),
  business_name               text not null default 'Vape Shop'
                                check (char_length(btrim(business_name)) between 1 and 60),
  address                     text check (char_length(address) <= 200),
  receipt_footer              text default 'Thank you! For adults 18+ only.'
                                check (char_length(receipt_footer) <= 200),
  min_age                     int not null default 18 check (min_age between 18 and 30),
  staff_discount_limit_cents  int not null default 5000 check (staff_discount_limit_cents >= 0),
  allow_negative_stock        boolean not null default false,
  updated_at                  timestamptz not null default now()
);
insert into public.settings (id) values (1);

alter table public.settings enable row level security;
create policy "staff read settings" on public.settings
  for select to authenticated using (public.is_staff());
create policy "owner writes settings" on public.settings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
revoke all on public.settings from anon;
revoke insert, update, delete on public.settings from authenticated;
grant update (business_name, address, receipt_footer, min_age, staff_discount_limit_cents, allow_negative_stock)
  on public.settings to authenticated;
