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

select pg_temp.expect_error('a new product''s starting pieces need a batch',
  $$select public.save_product(null, '{"name": "No Batch", "price_cents": 100, "opening_qty": 3}')$$, 'Pick the batch these pieces came in');
select public.save_product(null, '{"brand": "Relx", "name": "Infinity Pod", "variant": "Mint", "barcode": "4800001", "new_category": "Pods", "price_cents": 35000, "cost_cents": 21000, "reorder_at": 3}');
select public.save_product(null, '{"brand": "Relx", "name": "Infinity Pod", "variant": "Mango", "barcode": "4800002", "new_category": "pods", "price_cents": 35000, "cost_cents": 21000}');
select public.save_product(null, '{"name": "Coil 0.8Ω", "new_category": "Accessories", "price_cents": 15000}');
select pg_temp.check('new_category matches case-insensitively', (select count(*) = 2 from public.categories));
-- Stock from before batches: opening stock with no batch, as older versions recorded it.
reset role;
update public.products set on_hand = case variant when 'Mint' then 10 else 2 end where variant in ('Mint', 'Mango');
insert into public.stock_movements (product_id, kind, delta, on_hand_after, unit_cost_cents)
  select id, 'opening', on_hand, on_hand, 21000 from public.products where variant in ('Mint', 'Mango');
-- A batch for the stock changes below, numbered 0 so the batches made later start at 1.
insert into public.stock_batches (batch_no, note) values (0, 'Test batch') returning id as b0 \gset
set role authenticated;
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

select pg_temp.expect_error('a stock change needs its batch',
  $$select public.adjust_stock((select id from public.products where variant = 'Mango'), 'count', 5)$$, 'Pick the batch this is for');
select public.adjust_stock((select id from public.products where variant = 'Mango'), 'restock', 24, 20000, 'Supplier delivery', :'b0');
select pg_temp.check('restock adds pieces and updates cost',
  (select p.on_hand = 25 and c.cost_cents = 20000 from public.products p join public.product_costs c on c.product_id = p.id where p.variant = 'Mango'));
select public.adjust_stock((select id from public.products where variant = 'Mango'), 'waste', 1, null, 'Leaking', :'b0');
select public.adjust_stock((select id from public.products where variant = 'Mango'), 'count', 20, null, null, :'b0');
select pg_temp.check('count logs the correction in its batch',
  (select delta = -4 and on_hand_after = 20 and batch_id = :'b0' from public.stock_movements where kind = 'count' order by created_at desc limit 1));
select pg_temp.expect_error('waste needs at least 1',
  format($$select public.adjust_stock((select id from public.products where variant = 'Mango'), 'waste', 0, null, null, '%s')$$, :'b0'), 'at least 1');

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

-- ───────── Not paid yet and Collectibles (cashier) ─────────
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('unpaid needs the buyer''s name', format($$select public.complete_sale('{"client_ref": "%s", "payment_method": "unpaid", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}')$$,
  gen_random_uuid(), (select id from public.products where variant = 'Mango')), 'buyer''s name');
select public.complete_sale(format('{"client_ref": "aaaaaaaa-0000-0000-0000-000000000005", "payment_method": "unpaid", "customer_name": "  Juan  ", "reference": "x", "age_verified": true, "items": [{"product_id": "%s", "quantity": 2}]}',
  (select id from public.products where variant = 'Mango'))::jsonb) as owed \gset
select pg_temp.check('unpaid sale owes its total, name trimmed',
  (:'owed'::jsonb ->> 'balance_cents')::int = 70000
  and (select customer_name = 'Juan' and balance_cents = 70000 and reference is null from public.sales where id = (:'owed'::jsonb ->> 'id')::uuid));
select pg_temp.check('unpaid sale takes the stock', (select on_hand = 16 from public.products where variant = 'Mango'));
select pg_temp.check('collectibles lists it for staff',
  (select count(*) = 1 from jsonb_array_elements(public.collectibles()) e where (e ->> 'balance_cents')::int = 70000));
select pg_temp.expect_error('cannot collect more than owed', format($$select public.record_payment('%s', 70001, 'cash')$$, :'owed'::jsonb ->> 'id'), 'more than');
select pg_temp.expect_error('payment needs a real method', format($$select public.record_payment('%s', 100, 'unpaid')$$, :'owed'::jsonb ->> 'id'), 'how the buyer paid');
select public.record_payment((:'owed'::jsonb ->> 'id')::uuid, 20000, 'cash');
select pg_temp.check('part payment lowers the balance', (select balance_cents = 50000 from public.sales where id = (:'owed'::jsonb ->> 'id')::uuid));
select public.sales_summary(public.manila_today(), public.manila_today()) as sum_owed \gset
select pg_temp.check('summary shows unpaid and collected',
  (:'sum_owed'::jsonb -> 'by_method' -> 'unpaid' ->> 'cents')::int = 70000 and (:'sum_owed'::jsonb -> 'collected' -> 'cash' ->> 'cents')::int = 20000);
select public.record_payment((:'owed'::jsonb ->> 'id')::uuid, 50000, 'gcash', 'GC9');
select pg_temp.check('paid in full leaves collectibles', (select public.collectibles() = '[]'::jsonb));
select pg_temp.expect_error('nothing left to collect', format($$select public.record_payment('%s', 100, 'cash')$$, :'owed'::jsonb ->> 'id'), 'paid in full');

-- ───────── Restock: batches, sales by batch, pace, reorder levels (manager) ─────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, '{"name": "Batch Pod", "price_cents": 10000, "cost_cents": 5000}') as bp \gset
reset role;
update public.products set on_hand = 5 where id = :'bp';
insert into public.stock_movements (product_id, kind, delta, on_hand_after, unit_cost_cents) values (:'bp', 'opening', 5, 5, 5000);
set role authenticated;
select public.receive_batch(format('{"supplier": " Cloud Supply ", "note": "", "items": [{"product_id": "%s", "qty": 10, "unit_cost_cents": 6000}, {"product_id": "%s", "qty": 4}]}',
  :'bp', (select id from public.products where variant = 'Mango'))::jsonb) as batch1 \gset
select pg_temp.check('receive_batch numbers the batch and trims the supplier',
  (select batch_no = 1 and supplier = 'Cloud Supply' and note is null and received_on = public.manila_today() from public.stock_batches where id = :'batch1'));
select pg_temp.check('receive_batch puts the pieces on the shelf, logged as restocks in the batch',
  (select on_hand = 15 from public.products where id = :'bp')
  and (select count(*) = 2 from public.stock_movements where batch_id = :'batch1' and kind = 'restock'));
select pg_temp.check('a batch cost per piece becomes the product cost', (select cost_cents = 6000 from public.product_costs where product_id = :'bp'));
select public.complete_sale(format('{"client_ref": "bbbbbbbb-0000-0000-0000-000000000001", "payment_method": "cash", "tendered_cents": 70000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 7}]}', :'bp')::jsonb);
select public.complete_sale(format('{"client_ref": "bbbbbbbb-0000-0000-0000-000000000002", "payment_method": "gcash", "discount_cents": 2000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 2}]}', :'bp')::jsonb);
-- First in, first out: the 5 opening pieces sell first, then 4 of the batch's 10.
select pg_temp.check('opening stock sells first',
  (select received = 5 and sold = 5 and sales_cents = 50000 from public.batch_sales() where product_id = :'bp' and batch_id is null));
select pg_temp.check('then the batch: 2 at full price, 2 after the discount',
  (select received = 10 and sold = 4 and sales_cents = 2 * 10000 + 2 * 9000 and cost_cents = 4 * 6000 and uncosted = 0
     from public.batch_sales() where product_id = :'bp' and batch_id = :'batch1'));
select pg_temp.check('sales_pace counts pieces sold', (select sold = 9 and days >= 1 from public.sales_pace(28) where product_id = :'bp'));
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 3}]}', :'bp')::jsonb) as batch2 \gset
select pg_temp.check('the next batch gets the next number', (select batch_no = 2 from public.stock_batches where id = :'batch2'));
select pg_temp.check('a batch with no sales yet shows 0 sold',
  (select received = 3 and sold = 0 and sales_cents = 0 and first_sold_at is null from public.batch_sales() where batch_id = :'batch2'));
select pg_temp.check('every product: pieces matched to batches = the lesser of received and sold',
  not exists (
    select 1
      from (select product_id, sum(received) as rec, sum(sold) as sold from public.batch_sales() group by product_id) b
      left join (select i.product_id, sum(i.quantity) as qty from public.sale_items i join public.sales s on s.id = i.sale_id
                  where s.status = 'completed' group by i.product_id) t on t.product_id = b.product_id
     where b.sold <> least(b.rec, coalesce(t.qty, 0))));
select pg_temp.expect_error('a product only once per batch',
  format($$select public.receive_batch('{"items": [{"product_id": "%s", "qty": 1}, {"product_id": "%s", "qty": 2}]}')$$, :'bp', :'bp'), 'only be in a batch once');
select pg_temp.expect_error('batch pieces must be at least 1',
  format($$select public.receive_batch('{"items": [{"product_id": "%s", "qty": 0}]}')$$, :'bp'), '1 to 100,000');
select pg_temp.expect_error('no batches dated in the future',
  format($$select public.receive_batch('{"received_on": "%s", "items": [{"product_id": "%s", "qty": 1}]}')$$, public.manila_today() + 1, :'bp'), 'last 60 days');
select pg_temp.expect_error('an empty batch is refused', $$select public.receive_batch('{"items": []}')$$, 'at least one product');
select public.set_reorder_levels(format('[{"product_id": "%s", "reorder_at": 12}, {"product_id": "%s", "reorder_at": %s}]', :'bp',
    (select id from public.products where variant = 'Mint'), (select reorder_at from public.products where variant = 'Mint'))::jsonb) as changed \gset
select pg_temp.check('set_reorder_levels changes only what differs',
  :changed = 1 and (select reorder_at = 12 from public.products where id = :'bp'));
select pg_temp.expect_error('alert levels are checked', format($$select public.set_reorder_levels('[{"product_id": "%s", "reorder_at": -1}]')$$, :'bp'), '0 to 10,000');
select public.set_restock_plan(5, 2, 21);
select pg_temp.check('manager sets the reorder plan',
  (select restock_lead_days = 5 and restock_buffer_days = 2 and restock_cover_days = 21 from public.settings));
select pg_temp.expect_error('the plan is checked', $$select public.set_restock_plan(5, 2, 0)$$, '1 to 180');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff cannot receive batches',
  format($$select public.receive_batch('{"items": [{"product_id": "%s", "qty": 1}]}')$$, :'bp'), 'Only owners and managers');
select pg_temp.check('staff see no batches or batch sales',
  (select count(*) = 0 from public.stock_batches) and (select count(*) = 0 from public.batch_sales()) and (select count(*) = 0 from public.sales_pace(28)));
select pg_temp.expect_error('staff cannot change alert levels in bulk',
  format($$select public.set_reorder_levels('[{"product_id": "%s", "reorder_at": 1}]')$$, :'bp'), 'Only owners and managers');
select pg_temp.expect_error('staff cannot change the reorder plan', $$select public.set_restock_plan(1, 1, 1)$$, 'Only owners and managers');

-- ───────── Owner clean-up: delete test sales and products ─────────
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.save_product(null, format('{"name": "Junk Pod", "price_cents": 100, "opening_qty": 5, "batch_id": "%s"}', :'batch1')::jsonb) as junk \gset
select public.complete_sale(format('{"client_ref": "cccccccc-0000-0000-0000-000000000001", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'junk')::jsonb) ->> 'id' as junk_sale \gset
select public.complete_sale(format('{"client_ref": "cccccccc-0000-0000-0000-000000000002", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 2}, {"product_id": "%s", "quantity": 1}]}', :'junk', :'bp')::jsonb) ->> 'id' as mixed_sale \gset
select on_hand as bp_before from public.products where id = :'bp' \gset

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect_error('manager cannot delete sales', format($$select public.delete_sale('%s')$$, :'junk_sale'), 'Only the owner');
select pg_temp.expect_error('manager cannot delete products', format($$select public.delete_product('%s', true)$$, :'junk'), 'Only the owner');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff cannot delete sales', format($$select public.delete_sale('%s')$$, :'junk_sale'), 'Only the owner');
select pg_temp.expect_error('staff cannot call the internal remover', format($$select public.remove_sale('%s')$$, :'junk_sale'), 'permission denied');

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.delete_sale(:'junk_sale');
select pg_temp.check('deleted sale is gone with its items and stock moves, pieces back on the shelf',
  not exists (select 1 from public.sales where id = :'junk_sale')
  and not exists (select 1 from public.stock_movements where sale_id = :'junk_sale')
  and (select on_hand = 3 from public.products where id = :'junk'));
select pg_temp.expect_error('deleting it twice says so', format($$select public.delete_sale('%s')$$, :'junk_sale'), 'no longer exists');

-- A voided sale already put its pieces back: deleting it changes no stock.
select public.complete_sale(format('{"client_ref": "cccccccc-0000-0000-0000-000000000003", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'junk')::jsonb) ->> 'id' as void_me \gset
select public.void_sale(:'void_me', 'test');
select public.delete_sale(:'void_me');
select pg_temp.check('deleting a voided sale leaves stock as it was', (select on_hand = 3 from public.products where id = :'junk'));

select public.delete_product(:'junk', true) as del \gset
select pg_temp.check('product deleted with its sales, stock history and the other product''s pieces back',
  (:'del'::jsonb ->> 'sales_deleted')::int = 1
  and not exists (select 1 from public.products where id = :'junk')
  and not exists (select 1 from public.stock_movements where product_id = :'junk')
  and not exists (select 1 from public.sales where id = :'mixed_sale')
  and (select on_hand = :bp_before + 1 from public.products where id = :'bp'));

-- Without its sales: they stay, under the product's name.
select public.save_product(null, format('{"name": "Keep Sales Pod", "price_cents": 100, "opening_qty": 2, "batch_id": "%s"}', :'batch1')::jsonb) as keep \gset
select public.complete_sale(format('{"client_ref": "cccccccc-0000-0000-0000-000000000004", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'keep')::jsonb) ->> 'id' as keep_sale \gset
select public.delete_product(:'keep', false);
select pg_temp.check('product deleted alone: its sale stays under its name',
  (select product_id is null and name = 'Keep Sales Pod' from public.sale_items where sale_id = :'keep_sale'));

-- A batch left empty goes; one with other products stays.
select public.save_product(null, '{"name": "Batch Junk", "price_cents": 100}') as bj \gset
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 2}]}', :'bj')::jsonb) as bj_batch \gset
select public.delete_product(:'bj');
select pg_temp.check('an emptied batch is deleted, others stay',
  not exists (select 1 from public.stock_batches where id = :'bj_batch') and exists (select 1 from public.stock_batches where id = :'batch1'));

-- ───────── Batches: still owed, restock costs (manager) ─────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, '{"name": "Owed Pod", "price_cents": 1000}') as op \gset
select public.receive_batch(format('{"supplier": "S", "shipping_cents": 1000, "tax_cents": 500, "mooe_cents": 300, "other_cents": 200, "other_label": " Permit ", "items": [{"product_id": "%s", "qty": 10, "unit_cost_cents": 400}]}', :'op')::jsonb) as ob \gset
select pg_temp.check('receive_batch saves restock costs',
  (select shipping_cents = 1000 and tax_cents = 500 and mooe_cents = 300 and other_cents = 200 and other_label = 'Permit' from public.stock_batches where id = :'ob'));
select public.complete_sale(format('{"client_ref": "dddddddd-0000-0000-0000-000000000001", "payment_method": "unpaid", "customer_name": "Ana", "age_verified": true, "items": [{"product_id": "%s", "quantity": 2}]}', :'op')::jsonb) ->> 'id' as ana \gset
select public.complete_sale(format('{"client_ref": "dddddddd-0000-0000-0000-000000000002", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'op')::jsonb);
select public.record_payment(:'ana', 500, 'cash');
select pg_temp.check('batch sales show what is still owed and what the pieces cost',
  (select received = 10 and sold = 3 and sales_cents = 3000 and owed_cents = 1500 and received_cost_cents = 4000 and received_uncosted = 0
     from public.batch_sales() where batch_id = :'ob'));
select pg_temp.check('batch_owed lists who owes for the batch',
  (select count(*) = 1 and min(customer_name) = 'Ana' and min(pcs) = 2 and min(owed_cents) = 1500 from public.batch_owed(:'ob')));
select public.set_batch_costs(:'ob', '{"shipping_cents": 2500, "tax_cents": "", "other_label": ""}');
select pg_temp.check('set_batch_costs replaces the costs (missing = 0)',
  (select shipping_cents = 2500 and tax_cents = 0 and mooe_cents = 0 and other_cents = 0 and other_label is null from public.stock_batches where id = :'ob'));
select pg_temp.expect_error('restock costs are checked', format($$select public.set_batch_costs('%s', '{"shipping_cents": -1}')$$, :'ob'), '0 to');
select pg_temp.expect_error('receive_batch checks restock costs too',
  format($$select public.receive_batch('{"tax_cents": -5, "items": [{"product_id": "%s", "qty": 1}]}')$$, :'op'), '0 to');
select public.record_payment(:'ana', 1500, 'gcash');
select pg_temp.check('paid in full: nothing owed on the batch',
  (select owed_cents = 0 from public.batch_sales() where batch_id = :'ob') and not exists (select 1 from public.batch_owed(:'ob')));
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff cannot change restock costs', format($$select public.set_batch_costs('%s', '{}')$$, :'ob'), 'Only owners and managers');
select pg_temp.check('staff see no batch debts', (select count(*) = 0 from public.batch_owed(:'ob')));
select pg_temp.expect_error('staff cannot call the internal matcher', 'select count(*) from public.batch_matches()', 'permission denied');

-- ───────── Dashboard (manager) ─────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.dashboard(public.manila_today() - 6, public.manila_today(), 'day') as dash \gset
select pg_temp.check('dashboard: one bucket per day', jsonb_array_length(:'dash'::jsonb -> 'buckets') = 7);
select pg_temp.check('dashboard: totals match the sales',
  (:'dash'::jsonb -> 'current' ->> 'sales_cents')::bigint = (select sum(total_cents) from public.sales where status = 'completed' and business_date > public.manila_today() - 7)
  and (:'dash'::jsonb -> 'current' ->> 'sales')::int = (select count(*) from public.sales where status = 'completed' and business_date > public.manila_today() - 7)
  and (:'dash'::jsonb -> 'current' ->> 'pieces')::int = (select sum(i.quantity) from public.sale_items i join public.sales s on s.id = i.sale_id where s.status = 'completed' and s.business_date > public.manila_today() - 7));
select pg_temp.check('dashboard: buckets add up to the totals',
  (select sum((b ->> 'sales_cents')::bigint) from jsonb_array_elements(:'dash'::jsonb -> 'buckets') b) = (:'dash'::jsonb -> 'current' ->> 'sales_cents')::bigint
  and (select sum((b ->> 'pieces')::int) from jsonb_array_elements(:'dash'::jsonb -> 'buckets') b) = (:'dash'::jsonb -> 'current' ->> 'pieces')::int);
select pg_temp.check('dashboard: busiest-times grid counts every sale',
  (select sum((h ->> 'sales')::int) from jsonb_array_elements(:'dash'::jsonb -> 'hours') h) = (:'dash'::jsonb -> 'current' ->> 'sales')::int);
select pg_temp.check('dashboard: product sales after discounts, named in full',
  (select (p ->> 'pieces')::int = 9 and (p ->> 'sales_cents')::int = 7 * 10000 + 2 * 9000 and p ->> 'name' = 'Batch Pod'
     from jsonb_array_elements(:'dash'::jsonb -> 'products') p where p ->> 'product_id' = :'bp'));
select pg_temp.check('dashboard: previous period is there (empty here)', (:'dash'::jsonb -> 'previous' ->> 'sales')::int = 0);
select pg_temp.check('dashboard: weeks group by week', jsonb_array_length(public.dashboard(public.manila_today() - 27, public.manila_today(), 'week') -> 'buckets') between 4 and 5);
select (select id from public.categories where name = 'Pods') as pods \gset
select public.dashboard(public.manila_today() - 6, public.manila_today(), 'day', :'pods') as dpods \gset
select pg_temp.check('dashboard by category: only its products and their sales',
  (select bool_and(p ->> 'name' like 'Relx Infinity Pod%') from jsonb_array_elements(:'dpods'::jsonb -> 'products') p)
  and (:'dpods'::jsonb -> 'current' ->> 'pieces')::int = (select sum(i.quantity) from public.sale_items i join public.sales s on s.id = i.sale_id
        join public.products p on p.id = i.product_id where s.status = 'completed' and s.business_date > public.manila_today() - 7 and p.category_id = :'pods')
  and (:'dpods'::jsonb -> 'current' ->> 'sales_cents')::bigint < (:'dash'::jsonb -> 'current' ->> 'sales_cents')::bigint);
select pg_temp.check('dashboard: categories add up to the whole shop',
  (select sum((public.dashboard(public.manila_today() - 6, public.manila_today(), 'day', c.id) -> 'current' ->> 'sales_cents')::bigint) from public.categories c)
  + (select coalesce(round(sum(i.line_total_cents::numeric * s.total_cents / nullif(s.subtotal_cents, 0))), 0) from public.sale_items i join public.sales s on s.id = i.sale_id
      left join public.products p on p.id = i.product_id where s.status = 'completed' and s.business_date > public.manila_today() - 7 and p.category_id is null)
  between (:'dash'::jsonb -> 'current' ->> 'sales_cents')::bigint - 2 and (:'dash'::jsonb -> 'current' ->> 'sales_cents')::bigint + 2);
select pg_temp.expect_error('dashboard checks the grouping', $$select public.dashboard(current_date, current_date, 'hour')$$, 'day, week or month');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff cannot see the dashboard', $$select public.dashboard(current_date - 6, current_date)$$, 'Only owners and managers');

-- ───────── Expenses and profit split ─────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.add_expense(format('{"batch_id": "%s", "category": "salary", "amount_cents": 1500000, "note": " Cara, Nov 1-15 "}', :'ob')::jsonb) as exp1 \gset
select pg_temp.check('manager records an expense on a batch (note trimmed, dated today)',
  (select category = 'salary' and amount_cents = 1500000 and note = 'Cara, Nov 1-15' and spent_on = public.manila_today() and batch_id = :'ob' from public.expenses where id = :'exp1'));
select public.add_expense('{"category": "rent", "amount_cents": 800000, "note": "November"}') as gen \gset
select pg_temp.check('a general expense has no batch', (select batch_id is null and amount_cents = 800000 from public.expenses where id = :'gen'));
select pg_temp.expect_error('an expense''s batch must exist', $$select public.add_expense('{"batch_id": "00000000-0000-4000-8000-000000000000", "category": "rent", "amount_cents": 100}')$$, 'no longer exists');
select pg_temp.expect_error('expense category is checked', format($$select public.add_expense('{"batch_id": "%s", "category": "bribe", "amount_cents": 100}')$$, :'ob'), 'what the expense was for');
select pg_temp.expect_error('expense amount is checked', format($$select public.add_expense('{"batch_id": "%s", "category": "rent", "amount_cents": 0}')$$, :'ob'), 'amount');
select pg_temp.expect_error('no future expenses', format($$select public.add_expense('{"batch_id": "%s", "category": "rent", "amount_cents": 100, "spent_on": "%s"}')$$, :'ob', public.manila_today() + 1), 'last 400 days');
select pg_temp.expect_error('manager cannot change the split', $$select public.set_profit_split(1, 1)$$, 'Only the owner');
select pg_temp.check('split starts at 2 : 1', (select split_owner_parts = 2 and split_manager_parts = 1 from public.settings));
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff cannot record expenses', format($$select public.add_expense('{"batch_id": "%s", "category": "rent", "amount_cents": 100}')$$, :'ob'), 'Only owners and managers');
select pg_temp.check('staff cannot see expenses', (select count(*) = 0 from public.expenses));
select pg_temp.expect_error('staff cannot remove expenses', format($$select public.delete_expense('%s')$$, :'exp1'), 'Only owners and managers');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.set_profit_split(3, 1);
select pg_temp.check('owner changes the split', (select split_owner_parts = 3 and split_manager_parts = 1 from public.settings));
select pg_temp.expect_error('split needs at least one part', $$select public.set_profit_split(0, 0)$$, 'whole parts');
select public.delete_expense(:'exp1');
select pg_temp.check('expense removed', not exists (select 1 from public.expenses where id = :'exp1'));
-- A batch whose last product is deleted stays if it has expenses.
select public.save_product(null, '{"name": "Kept Batch Pod", "price_cents": 100}') as kbp \gset
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 2}]}', :'kbp')::jsonb) as kb \gset
select public.add_expense(format('{"batch_id": "%s", "category": "other", "amount_cents": 500}', :'kb')::jsonb);
select public.delete_product(:'kbp');
select pg_temp.check('a batch with expenses is kept when its last product goes', exists (select 1 from public.stock_batches where id = :'kb'));

-- ───────── Turn stock before batches into a batch ─────────
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff cannot make batches', $$select public.batch_existing_stock('{}')$$, 'Only owners and managers');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
reset role;
insert into public.stock_movements (product_id, kind, delta, on_hand_after) select id, 'count', 0, on_hand from public.products where id = :'bp';
set role authenticated;
select count(*) as loose_before from public.stock_movements where batch_id is null and kind in ('opening', 'restock', 'count', 'waste') \gset
select (select coalesce(sum(sold), 0) from public.batch_sales() where batch_id is null) as loose_sold \gset
select public.batch_existing_stock('{"supplier": " Old supplier "}') as made \gset
select pg_temp.check('stock before batches becomes a batch (named, numbered, dated, labelled)',
  (select supplier = 'Old supplier' and note = 'Earlier stock' and batch_no = (select max(batch_no) from public.stock_batches)
     and received_on = (select (min(created_at) at time zone 'Asia/Manila')::date from public.stock_movements where batch_id = :'made')
     from public.stock_batches where id = :'made')
  and (select count(*) from public.stock_movements where batch_id = :'made') = :loose_before
  and not exists (select 1 from public.stock_movements where batch_id is null and kind in ('opening', 'restock', 'count', 'waste')));
select pg_temp.check('its sales move with it', (select sum(sold) from public.batch_sales() where batch_id = :'made') = :loose_sold
  and not exists (select 1 from public.batch_sales() where batch_id is null));
select public.add_expense(format('{"batch_id": "%s", "category": "other", "amount_cents": 1000}', :'made')::jsonb);
select pg_temp.check('it can take expenses now', exists (select 1 from public.expenses where batch_id = :'made'));
select pg_temp.check('earlier stock was already paid for: not charged to the funds', (select not paid_from_funds from public.stock_batches where id = :'made'));
select pg_temp.expect_error('nothing left to batch', $$select public.batch_existing_stock('{}')$$, 'already in a batch');

-- ───────── Reservations (all staff) ─────────
reset role;
update public.settings set allow_negative_stock = false;
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, format('{"name": "Res Pod", "price_cents": 1000, "opening_qty": 5, "batch_id": "%s"}', :'batch1')::jsonb) as rp \gset
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.reserve_product(format('{"product_id": "%s", "customer_name": "  Juan   Cruz ", "qty": 3, "hold_until": "%s"}', :'rp', public.manila_today() + 2)::jsonb) as r1 \gset
select pg_temp.check('staff reserve pieces for a customer (name tidied)',
  (select customer_name = 'Juan Cruz' and qty = 3 and status = 'active' and hold_until = public.manila_today() + 2 from public.reservations where id = :'r1'));
select pg_temp.expect_error('can''t reserve more than is free', format($$select public.reserve_product('{"product_id": "%s", "customer_name": "Ana", "qty": 3}')$$, :'rp'), 'Only 2 left');
select public.reserve_product(format('{"product_id": "%s", "customer_name": "Ana", "qty": 2}', :'rp')::jsonb) as r2 \gset
select pg_temp.expect_error('a reservation needs a name', format($$select public.reserve_product('{"product_id": "%s", "customer_name": " ", "qty": 1}')$$, :'rp'), 'customer''s name');
select public.close_reservation(:'r1');
select pg_temp.check('cancel frees the pieces', (select status = 'cancelled' and closed_at is not null from public.reservations where id = :'r1')
  and (select sum(qty) = 2 from public.reservations where product_id = :'rp' and status = 'active'));
select public.complete_sale(format('{"client_ref": "eeeeeeee-0000-0000-0000-000000000001", "payment_method": "gcash", "age_verified": true, "customer_name": "Ana", "items": [{"product_id": "%s", "quantity": 2}]}', :'rp')::jsonb) ->> 'id' as rsale \gset
select public.close_reservation(:'r2', :'rsale');
select pg_temp.check('selling closes the reservation with its sale', (select status = 'sold' and sale_id = :'rsale' from public.reservations where id = :'r2'));
select pg_temp.expect_error('a closed reservation stays closed', format($$select public.close_reservation('%s')$$, :'r2'), 'already closed');

-- ───────── Company funds (owner releases; manager sees) ─────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.company_funds() as f0 \gset
select pg_temp.check('funds: gross − discounts = net; net − still owed = collected; collected split by how it was paid',
  (:'f0'::jsonb ->> 'gross_cents')::bigint = (select sum(subtotal_cents) from public.sales where status = 'completed')
  and (:'f0'::jsonb ->> 'net_cents')::bigint = (:'f0'::jsonb ->> 'gross_cents')::bigint - (:'f0'::jsonb ->> 'discount_cents')::bigint
  and (:'f0'::jsonb ->> 'collected_cents')::bigint = (select sum(total_cents - balance_cents) from public.sales where status = 'completed')
  and (select sum(value::bigint) from jsonb_each_text(:'f0'::jsonb -> 'collected_by_method')) = (:'f0'::jsonb ->> 'collected_cents')::bigint);
select public.set_batch_paid_from_funds(:'made', true);
select pg_temp.check('switched on, opening stock''s cost counts in the funds (Mint 10 + Mango 2 at 210, Batch Pod 5 at 50)',
  (public.company_funds() ->> 'goods_cents')::bigint = (:'f0'::jsonb ->> 'goods_cents')::bigint + (12 * 21000 + 5 * 5000));
select public.set_batch_paid_from_funds(:'made', false);
select public.save_product(null, '{"name": "Fund Pod", "price_cents": 1000}') as fp \gset
select public.receive_batch(format('{"shipping_cents": 500, "items": [{"product_id": "%s", "qty": 10, "unit_cost_cents": 300}]}', :'fp')::jsonb) as fb \gset
select public.company_funds() as f1 \gset
select pg_temp.check('a new batch is paid from the funds (goods + restocking fees) and is the reserve',
  (:'f1'::jsonb ->> 'goods_cents')::bigint = (:'f0'::jsonb ->> 'goods_cents')::bigint + 3000
  and (:'f1'::jsonb ->> 'restock_fees_cents')::bigint = (:'f0'::jsonb ->> 'restock_fees_cents')::bigint + 500
  and (:'f1'::jsonb ->> 'balance_cents')::bigint = (:'f0'::jsonb ->> 'balance_cents')::bigint - 3500
  and (:'f1'::jsonb ->> 'reserve_cents')::bigint = 3500
  and (:'f1'::jsonb ->> 'available_cents')::bigint = greatest(0, (:'f1'::jsonb ->> 'balance_cents')::bigint - 3500));
select public.set_batch_paid_from_funds(:'fb', false);
select pg_temp.check('a batch not paid from funds isn''t charged',
  (public.company_funds() ->> 'goods_cents')::bigint = (:'f0'::jsonb ->> 'goods_cents')::bigint);
select public.set_batch_paid_from_funds(:'fb', true);
select pg_temp.expect_error('manager can''t release profits', $$select public.release_profits(100)$$, 'Only the owner');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- A big sale so the test shop has profit above the reserve.
select public.save_product(null, format('{"name": "Big Pod", "price_cents": 10000000, "opening_qty": 1, "batch_id": "%s"}', :'fb')::jsonb) as bigp \gset
select public.complete_sale(format('{"client_ref": "eeeeeeee-0000-0000-0000-000000000002", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'bigp')::jsonb);
select (public.company_funds() ->> 'available_cents')::bigint as avail \gset
select pg_temp.check('a paid sale adds to what''s available', :avail > 4000);
select pg_temp.expect_error('can''t release more than is available', format($$select public.release_profits(%s)$$, :avail + 1), 'available to release');
select public.release_profits(4000, 'Batch 1 profit') as rel \gset
select pg_temp.check('a release is split by the profit split (3 : 1 here) and comes off what''s available',
  (select owner_cents = 3000 and manager_cents = 1000 and note = 'Batch 1 profit' from public.fund_releases where id = :'rel')
  and (public.company_funds() ->> 'available_cents')::bigint = :avail - 4000
  and (public.company_funds() ->> 'owner_released_cents')::bigint = 3000);
select public.delete_fund_release(:'rel');
select pg_temp.check('owner can undo a release', not exists (select 1 from public.fund_releases where id = :'rel'));
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('staff see no funds', public.company_funds() is null and (select count(*) = 0 from public.fund_releases));
select pg_temp.expect_error('staff can''t call the internal summary', 'select public.funds_summary()', 'permission denied');

-- ───────── Fixing stock changes (owners and managers) ─────────
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, format('{"name": "Fix Pod", "price_cents": 1000, "cost_cents": 400, "opening_qty": 10, "batch_id": "%s"}', :'fb')::jsonb) as xp \gset
select pg_temp.check('a new product''s starting pieces come in with their batch, at its cost',
  (select count(*) = 1 from public.stock_movements where product_id = :'xp' and kind = 'restock' and batch_id = :'fb' and delta = 10 and unit_cost_cents = 400)
  and (select on_hand = 10 from public.products where id = :'xp'));
select public.adjust_stock(:'xp', 'restock', 5, null, null, :'fb');
select public.adjust_stock(:'xp', 'waste', 2, null, null, :'fb');
select public.adjust_stock(:'xp', 'count', 20, null, null, :'fb');
select pg_temp.check('a restock without a cost takes the product''s cost',
  (select unit_cost_cents = 400 from public.stock_movements where product_id = :'xp' and kind = 'restock' and delta = 5));
select id as mv_restock from public.stock_movements where product_id = :'xp' and kind = 'restock' and delta = 5 \gset
select id as mv_waste from public.stock_movements where product_id = :'xp' and kind = 'waste' \gset
select id as mv_count from public.stock_movements where product_id = :'xp' and kind = 'count' \gset
select public.edit_stock_change(:'mv_restock', 8);
select pg_temp.check('editing a restock carries through; a later count absorbs it',
  (select delta = 8 and on_hand_after = 18 from public.stock_movements where id = :'mv_restock')
  and (select on_hand_after = 16 from public.stock_movements where id = :'mv_waste')
  and (select delta = 4 and on_hand_after = 20 from public.stock_movements where id = :'mv_count')
  and (select on_hand = 20 from public.products where id = :'xp'));
select public.remove_stock_change(:'mv_count');
select pg_temp.check('removing a count puts the shelf back to before it',
  (select on_hand = 16 from public.products where id = :'xp') and not exists (select 1 from public.stock_movements where id = :'mv_count'));
select public.edit_stock_change(:'mv_waste', 1);
select pg_temp.check('editing pieces lost', (select delta = -1 and on_hand_after = 17 from public.stock_movements where id = :'mv_waste')
  and (select on_hand = 17 from public.products where id = :'xp'));
select pg_temp.check('batch sales show the batch''s counts and losses per product',
  (select received = 18 and sold = 0 and adjusted = -1 from public.batch_sales() where product_id = :'xp' and batch_id = :'fb'));
select pg_temp.expect_error('sales aren''t fixed here',
  format($$select public.edit_stock_change('%s', 1)$$, (select id from public.stock_movements where kind = 'sale' limit 1)), 'fixed from the sale');
select pg_temp.expect_error('restock needs at least 1 piece', format($$select public.edit_stock_change('%s', 0)$$, :'mv_restock'), '1 to 100,000');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff can''t fix stock', format($$select public.remove_stock_change('%s')$$, :'mv_waste'), 'Only owners and managers');

reset role;
select case when ok then 'ok   ' else 'FAIL ' end || name as result from results;
select count(*) filter (where not ok) as failures, count(*) as checks from results;
