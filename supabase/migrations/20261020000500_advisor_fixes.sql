-- Supabase performance advisor: evaluate auth.uid() once per query, and index the staff
-- foreign keys (they're checked when a staff account is removed).

alter policy "read own or staff profiles" on public.profiles
  using (id = (select auth.uid()) or (select public.is_staff()));

create index sales_created_by_idx on public.sales (created_by);
create index sales_voided_by_idx on public.sales (voided_by);
create index stock_movements_created_by_idx on public.stock_movements (created_by);
