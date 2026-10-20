-- Vape POS: products, sales and the stock log. Writes go through the functions in the next migration.

-- ───────── Products ─────────

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order  int not null default 0,
  active      boolean not null default true
);
create unique index categories_name_key on public.categories (lower(name));

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories (id) on delete set null,
  brand        text check (char_length(brand) <= 60),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  variant      text check (char_length(variant) <= 60),   -- flavour, colour, strength
  barcode      text check (barcode ~ '^[A-Za-z0-9._-]{1,40}$'),
  price_cents  int not null check (price_cents >= 0),
  on_hand      int not null default 0,                     -- pieces on the shelf
  reorder_at   int not null default 5 check (reorder_at >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index products_barcode_key on public.products (barcode) where barcode is not null;
create index products_category_idx on public.products (category_id);

-- What a piece costs us. Owners and managers only.
create table public.product_costs (
  product_id  uuid primary key references public.products (id) on delete cascade,
  cost_cents  int not null check (cost_cents >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
create policy "staff read categories" on public.categories
  for select to authenticated using (public.is_staff());
create policy "staff read products" on public.products
  for select to authenticated using (public.is_staff());
create policy "managers read product_costs" on public.product_costs
  for select to authenticated using (public.is_manager());

revoke all on public.categories, public.products, public.product_costs from anon;
revoke insert, update, delete on public.categories, public.products, public.product_costs from authenticated;
grant select on public.categories, public.products, public.product_costs to authenticated;

-- ───────── Sales ─────────

create type public.payment_method as enum ('cash', 'gcash', 'maya', 'card', 'bank_transfer');
create type public.sale_status as enum ('completed', 'voided');

create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  client_ref      uuid not null unique,            -- the register's id for this sale: a retried tap can't sell twice
  sale_number     int not null,                    -- resets daily: #1, #2…
  business_date   date not null default public.manila_today(),
  status          public.sale_status not null default 'completed',
  subtotal_cents  int not null check (subtotal_cents >= 0),
  discount_cents  int not null default 0 check (discount_cents >= 0 and discount_cents <= subtotal_cents),
  total_cents     int not null check (total_cents >= 0),
  payment_method  public.payment_method not null,
  tendered_cents  int check (tendered_cents >= 0),
  change_cents    int check (change_cents >= 0),
  reference       text check (char_length(reference) <= 60),
  age_verified    boolean not null check (age_verified),
  note            text check (char_length(note) <= 300),
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references public.profiles (id) on delete set null,
  void_reason     text check (char_length(void_reason) <= 200),
  unique (business_date, sale_number)
);
create index sales_date_idx on public.sales (business_date desc, sale_number desc);

create table public.sale_items (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references public.sales (id) on delete cascade,
  product_id        uuid references public.products (id) on delete set null,
  name              text not null,                 -- snapshot: brand + name + variant at the time of sale
  unit_price_cents  int not null check (unit_price_cents >= 0),
  unit_cost_cents   int,                           -- snapshot of product_costs; managers see it through sales_summary
  quantity          int not null check (quantity > 0),
  line_total_cents  int not null check (line_total_cents >= 0)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

create function public.set_sale_number()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('sale_number:' || new.business_date));
  select coalesce(max(sale_number), 0) + 1 into new.sale_number
    from public.sales where business_date = new.business_date;
  return new;
end;
$$;

create trigger sales_set_number
  before insert on public.sales
  for each row execute function public.set_sale_number();

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
-- Staff see today's sales; owners and managers see every day.
create policy "staff read sales" on public.sales
  for select to authenticated
  using (public.is_manager() or (public.is_staff() and business_date = public.manila_today()));
create policy "staff read sale_items" on public.sale_items
  for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));

revoke all on public.sales, public.sale_items from anon;
revoke all on public.sales, public.sale_items from authenticated;
grant select on public.sales to authenticated;
grant select (id, sale_id, product_id, name, unit_price_cents, quantity, line_total_cents)
  on public.sale_items to authenticated;

-- ───────── Stock log ─────────

create table public.stock_movements (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  kind             text not null check (kind in ('opening', 'sale', 'void', 'restock', 'count', 'waste')),
  delta            int not null,                   -- + in, − out (count: the correction)
  on_hand_after    int not null,
  sale_id          uuid references public.sales (id) on delete set null,
  unit_cost_cents  int,                            -- restock: what each piece cost
  note             text check (char_length(note) <= 200),
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_sale_idx on public.stock_movements (sale_id);

alter table public.stock_movements enable row level security;
create policy "managers read stock_movements" on public.stock_movements
  for select to authenticated using (public.is_manager());
revoke all on public.stock_movements from anon;
revoke insert, update, delete on public.stock_movements from authenticated;
grant select on public.stock_movements to authenticated;
