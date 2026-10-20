-- Database tests for the Vape POS rules. Runs against a plain Postgres with
-- supabase/tests/supabase_stub.sql loaded first, then the migrations:
--   psql -f supabase/tests/supabase_stub.sql -f supabase/migrations/*.sql -f supabase/tests/pos_test.sql
-- Each check prints ok / FAIL; the script ends with a count of failures.
\set ON_ERROR_STOP 1
\pset pager off
set client_min_messages = warning;

create temporary table results (name text, ok boolean);
grant all on results to authenticated;

-- Expect a statement to fail with a message containing `want`.
create function pg_temp.expect_error(p_name text, p_sql text, p_want text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into results values (p_name || ' (no error)', false);
  exception when others then
    insert into results values (p_name || case when sqlerrm ilike '%' || p_want || '%' then '' else ' (got: ' || sqlerrm || ')' end,
                                sqlerrm ilike '%' || p_want || '%');
  end;
end $$;
create function pg_temp.check(p_name text, p_ok boolean) returns void language sql as $$
  insert into results values (p_name, coalesce(p_ok, false));
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- ───────── Sign-ups ─────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner@x', '{"full_name": "Olive Owner"}');
insert into auth.users (id, email, raw_user_meta_data) values
  ('22222222-2222-2222-2222-222222222222', 'cash@x', '{"full_name": "Cara Cashier"}'),
  ('33333333-3333-3333-3333-333333333333', 'mgr@x', '{"full_name": "Max Manager"}'),
  ('44444444-4444-4444-4444-444444444444', 'new@x', '{"full_name": "Nina New"}');

select pg_temp.check('first sign-up is the active owner',
  (select role = 'owner' and active from public.profiles where id = '11111111-1111-1111-1111-111111111111'));
select pg_temp.check('later sign-ups start as inactive staff',
  (select bool_and(role = 'cashier' and not active) from public.profiles where id <> '11111111-1111-1111-1111-111111111111'));

-- ───────── Owner ─────────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

update public.profiles set active = true where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set active = true, role = 'manager' where id = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('owner activates staff', (select count(*) = 2 from public.profiles where active and role <> 'owner'));
select pg_temp.check('owner sees staff emails', (select count(*) = 4 from public.staff_accounts()));
select pg_temp.expect_error('last owner cannot demote themselves',
  $$update public.profiles set role = 'manager' where id = '11111111-1111-1111-1111-111111111111'$$, 'at least one active owner');

select public.save_product(null, '{"brand": "Relx", "name": "Infinity Pod", "variant": "Mint", "barcode": "4800001", "new_category": "Pods", "price_cents": 35000, "cost_cents": 21000, "opening_qty": 10, "reorder_at": 3}');
select public.save_product(null, '{"brand": "Relx", "name": "Infinity Pod", "variant": "Mango", "barcode": "4800002", "new_category": "pods", "price_cents": 35000, "cost_cents": 21000, "opening_qty": 2}');
select public.save_product(null, '{"name": "Coil 0.8Ω", "new_category": "Accessories", "price_cents": 15000}');
select pg_temp.check('new_category matches case-insensitively', (select count(*) = 2 from public.categories));
select pg_temp.check('opening stock is logged', (select count(*) = 2 from public.stock_movements where kind = 'opening'));
select pg_temp.check('product without opening stock has 0', (select on_hand = 0 from public.products where name = 'Coil 0.8Ω'));
select pg_temp.expect_error('duplicate barcode refused',
  $$select public.save_product(null, '{"name": "Dup", "barcode": "4800001", "price_cents": 100}')$$, 'products_barcode_key');

update public.settings set business_name = 'Cloud Nine Vapes', min_age = 18 where id = 1;
select pg_temp.check('owner edits settings', (select business_name = 'Cloud Nine Vapes' from public.settings));

-- ───────── Cashier ─────────
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select pg_temp.check('cashier sees products', (select count(*) = 3 from public.products));
select pg_temp.check('cashier sees no costs', (select count(*) = 0 from public.product_costs));
select pg_temp.check('cashier sees no stock log', (select count(*) = 0 from public.stock_movements));
select pg_temp.expect_error('cashier cannot read cost snapshots', $$select unit_cost_cents from public.sale_items$$, 'permission denied');
select pg_temp.expect_error('cashier cannot edit products',
  $$select public.save_product(null, '{"name": "X", "price_cents": 1}')$$, 'Only owners and managers');
select pg_temp.expect_error('cashier cannot write products directly', $$update public.products set price_cents = 1$$, 'permission denied');
select pg_temp.expect_error('cashier cannot adjust stock',
  $$select public.adjust_stock((select id from public.products where variant = 'Mint'), 'count', 99)$$, 'Only owners and managers');
update public.settings set min_age = 21;
select pg_temp.check('cashier cannot change settings', (select min_age = 18 from public.settings));

-- Checkout rules
select pg_temp.expect_error('age check is required', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "cash", "items": [{"product_id": "%s", "quantity": 1}]}')$$,
  gen_random_uuid(), (select id from public.products where variant = 'Mint')), 'ID');
select pg_temp.expect_error('empty cart refused', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "cash", "age_verified": true, "items": []}')$$,
  gen_random_uuid()), 'at least one item');
select pg_temp.expect_error('payment method required', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "bitcoin", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}')$$,
  gen_random_uuid(), (select id from public.products where variant = 'Mint')), 'how the customer paid');
select pg_temp.expect_error('cannot oversell', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 3}]}')$$,
  gen_random_uuid(), (select id from public.products where variant = 'Mango')), 'Only 2 left');
select pg_temp.expect_error('short cash refused', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "cash", "tendered_cents": 30000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}')$$,
  gen_random_uuid(), (select id from public.products where variant = 'Mint')), 'less than the total');
select pg_temp.expect_error('staff discount limit', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "cash", "discount_cents": 6000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}')$$,
  gen_random_uuid(), (select id from public.products where variant = 'Mint')), 'need an owner or manager');

-- A good sale: 2 Mint (same product listed twice) + 1 Mango, ₱50 off, ₱1,000 cash.
select public.complete_sale(format('{"client_ref": "aaaaaaaa-0000-0000-0000-000000000001", "payment_method": "cash", "tendered_cents": 100000, "discount_cents": 5000, "age_verified": true, "price_cents": 1,
  "items": [{"product_id": "%1$s", "quantity": 1, "price_cents": 1}, {"product_id": "%1$s", "quantity": 1}, {"product_id": "%2$s", "quantity": 1}]}',
  (select id from public.products where variant = 'Mint'), (select id from public.products where variant = 'Mango'))::jsonb) as sale1 \gset
select pg_temp.check('total uses database prices', (:'sale1'::jsonb ->> 'total_cents')::int = 100000);
select pg_temp.check('change is computed', (:'sale1'::jsonb ->> 'change_cents')::int = 0);
select pg_temp.check('sale #1 of the day', (:'sale1'::jsonb ->> 'sale_number')::int = 1);
select pg_temp.check('same product merges into one line', (select count(*) = 2 from public.sale_items));
select pg_temp.check('stock deducted per piece',
  (select string_agg(variant || '=' || on_hand, ',' order by variant) = 'Mango=1,Mint=8' from public.products where variant is not null));
select pg_temp.check('cashier sees today''s sale', (select count(*) = 1 from public.sales));
select pg_temp.check('sale records the cashier', (select created_by = '22222222-2222-2222-2222-222222222222' from public.sales));

-- Same tap twice: no second sale.
select public.complete_sale(format('{"client_ref": "aaaaaaaa-0000-0000-0000-000000000001", "payment_method": "cash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}',
  (select id from public.products where variant = 'Mint'))::jsonb) as again \gset
select pg_temp.check('retried tap returns the same sale', (:'again'::jsonb ->> 'repeat')::boolean and (select count(*) = 1 from public.sales));

select public.complete_sale(format('{"client_ref": "aaaaaaaa-0000-0000-0000-000000000002", "payment_method": "gcash", "reference": "GC123", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}',
  (select id from public.products where variant = 'Mint'))::jsonb) as sale2 \gset
select pg_temp.check('gcash sale has no change', (:'sale2'::jsonb ->> 'change_cents') is null and (:'sale2'::jsonb ->> 'sale_number')::int = 2);

select pg_temp.expect_error('cashier cannot void', format($$select public.void_sale('%s', 'oops')$$, :'sale2'::jsonb ->> 'id'), 'Only owners and managers');
select pg_temp.expect_error('cashier cannot see past days', $$select public.sales_summary(public.manila_today() - 1, public.manila_today())$$, 'Past days');
select public.sales_summary(public.manila_today(), public.manila_today()) as sum_cashier \gset
select pg_temp.check('cashier summary: totals, no profit',
  (:'sum_cashier'::jsonb ->> 'net_cents')::int = 135000 and (:'sum_cashier'::jsonb ->> 'cogs_cents') is null
  and (:'sum_cashier'::jsonb -> 'by_method' -> 'gcash' ->> 'cents')::int = 35000);
select pg_temp.check('cashier gets no stock value', (select public.stock_value() is null));

-- ───────── Inactive account ─────────
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select pg_temp.check('inactive account sees no products', (select count(*) = 0 from public.products));
select pg_temp.check('inactive account sees no sales', (select count(*) = 0 from public.sales));
select pg_temp.expect_error('inactive account cannot sell', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "cash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}')$$,
  gen_random_uuid(), (select id from public.products limit 1)), 'isn''t active');

-- ───────── Manager ─────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select pg_temp.check('manager sees costs', (select count(*) = 2 from public.product_costs));
select public.void_sale((:'sale2'::jsonb ->> 'id')::uuid, 'Rang up the wrong flavour');
select pg_temp.check('void puts stock back', (select on_hand = 8 from public.products where variant = 'Mint'));
select pg_temp.expect_error('cannot void twice', format($$select public.void_sale('%s', 'again')$$, :'sale2'::jsonb ->> 'id'), 'already voided');
select pg_temp.expect_error('void needs a reason', format($$select public.void_sale('%s', '  ')$$, :'sale1'::jsonb ->> 'id'), 'reason');

select public.adjust_stock((select id from public.products where variant = 'Mango'), 'restock', 24, 20000, 'Supplier delivery');
select pg_temp.check('restock adds pieces and updates cost',
  (select p.on_hand = 25 and c.cost_cents = 20000 from public.products p join public.product_costs c on c.product_id = p.id where p.variant = 'Mango'));
select public.adjust_stock((select id from public.products where variant = 'Mango'), 'waste', 1, null, 'Leaking');
select public.adjust_stock((select id from public.products where variant = 'Mango'), 'count', 20, null, null);
select pg_temp.check('count logs the correction',
  (select delta = -4 and on_hand_after = 20 from public.stock_movements where kind = 'count' order by created_at desc limit 1));
select pg_temp.expect_error('waste needs at least 1', $$select public.adjust_stock((select id from public.products where variant = 'Mango'), 'waste', 0)$$, 'at least 1');

select public.complete_sale(format('{"client_ref": "aaaaaaaa-0000-0000-0000-000000000003", "payment_method": "maya", "discount_cents": 10000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 2}]}',
  (select id from public.products where variant = 'Mango'))::jsonb) as sale3 \gset
select pg_temp.check('manager may discount over the staff limit', (:'sale3'::jsonb ->> 'total_cents')::int = 60000);

select public.sales_summary(public.manila_today() - 7, public.manila_today()) as sum_mgr \gset
select pg_temp.check('manager summary excludes voided sales',
  (:'sum_mgr'::jsonb ->> 'sales')::int = 2 and (:'sum_mgr'::jsonb ->> 'voided')::int = 1 and (:'sum_mgr'::jsonb ->> 'net_cents')::int = 160000);
-- Cost snapshots: sale 1 = 2×210 + 1×210, sale 3 = 2×200.
select pg_temp.check('manager summary has cost of goods', (:'sum_mgr'::jsonb ->> 'cogs_cents')::int = 103000);
select pg_temp.check('pieces sold', (:'sum_mgr'::jsonb ->> 'pieces')::int = 5);
select pg_temp.check('stock value at cost', (select (public.stock_value() ->> 'cost_cents')::int = 8 * 21000 + 18 * 20000));
update public.settings set min_age = 21;
select pg_temp.check('manager cannot change settings', (select min_age = 18 from public.settings));

-- Negative stock when the owner allows it
reset role;
update public.settings set allow_negative_stock = true;
set role authenticated;
select public.complete_sale(format('{"client_ref": "aaaaaaaa-0000-0000-0000-000000000004", "payment_method": "card", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}',
  (select id from public.products where name = 'Coil 0.8Ω'))::jsonb) is not null as sold_neg \gset
select pg_temp.check('allow_negative_stock lets an uncounted item sell', :'sold_neg' and (select on_hand = -1 from public.products where name = 'Coil 0.8Ω'));

-- Deactivated product can't be sold
select public.save_product((select id from public.products where variant = 'Mint'),
  '{"brand": "Relx", "name": "Infinity Pod", "variant": "Mint", "barcode": "4800001", "price_cents": 35000, "active": false}');
select pg_temp.expect_error('inactive product refused', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "cash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}')$$,
  gen_random_uuid(), (select id from public.products where variant = 'Mint')), 'no longer for sale');
select pg_temp.check('saving without cost_cents keeps the cost',
  (select cost_cents = 21000 from public.product_costs c join public.products p on p.id = c.product_id where p.variant = 'Mint'));

reset role;
select case when ok then 'ok   ' else 'FAIL ' end || name as result from results;
select count(*) filter (where not ok) as failures, count(*) as checks from results;
