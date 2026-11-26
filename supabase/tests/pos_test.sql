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
reset role;
select pg_temp.check('earlier stock was already paid for, with the owners'' money: one payment of its cost in full',
  (select count(*) = 1 and bool_and(source = 'owner') and sum(amount_cents) = (select cost_cents from public.batch_money(:'made'))
     from public.batch_payments where batch_id = :'made')
  and (select cost_cents > 0 and owed_cents = 0 from public.batch_money(:'made')));
set role authenticated;
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
select public.update_batch_payment((select id from public.batch_payments where batch_id = :'made'),
  format('{"amount_cents": %s, "source": "company", "paid_on": "%s"}', (select sum(amount_cents) from public.batch_payments where batch_id = :'made'), public.manila_today())::jsonb);
select pg_temp.check('paid from the company fund instead, the earlier stock''s cost counts in the funds (Mint 10 + Mango 2 at 210, Batch Pod 5 at 50)',
  (public.company_funds() ->> 'stock_paid_cents')::bigint = (:'f0'::jsonb ->> 'stock_paid_cents')::bigint + (12 * 21000 + 5 * 5000));
select public.update_batch_payment((select id from public.batch_payments where batch_id = :'made'),
  format('{"amount_cents": %s, "source": "owner", "paid_on": "%s"}', (select sum(amount_cents) from public.batch_payments where batch_id = :'made'), public.manila_today())::jsonb);
select public.save_product(null, '{"name": "Fund Pod", "price_cents": 1000}') as fp \gset
select public.receive_batch(format('{"shipping_cents": 500, "items": [{"product_id": "%s", "qty": 10, "unit_cost_cents": 300}]}', :'fp')::jsonb) as fb \gset
select public.company_funds() as f1 \gset
select pg_temp.check('a new batch is paid in full from the funds (goods + restocking fees); nothing kept until you decide, so it asks',
  (:'f1'::jsonb ->> 'stock_paid_cents')::bigint = (:'f0'::jsonb ->> 'stock_paid_cents')::bigint + 3500
  and (select count(*) = 1 and sum(amount_cents) = 3500 and bool_and(source = 'company' and paid_on = public.manila_today())
         from public.batch_payments where batch_id = :'fb')
  and (:'f1'::jsonb ->> 'balance_cents')::bigint = (:'f0'::jsonb ->> 'balance_cents')::bigint - 3500
  and (:'f1'::jsonb ->> 'kept_cents')::bigint = 0
  and (:'f1'::jsonb ->> 'needs_decision')::boolean
  and (:'f1'::jsonb ->> 'last_batch_cents')::bigint = 3500
  and (:'f1'::jsonb ->> 'available_cents')::bigint = greatest(0, (:'f1'::jsonb ->> 'balance_cents')::bigint));
select public.set_restock_set_aside(2000, ' Next order ');
select public.company_funds() as f2 \gset
select pg_temp.check('deciding what to keep for the next restock holds it back and clears the ask',
  (:'f2'::jsonb ->> 'kept_cents')::bigint = 2000 and (:'f2'::jsonb ->> 'set_aside_note') = 'Next order'
  and not (:'f2'::jsonb ->> 'needs_decision')::boolean
  and (:'f2'::jsonb ->> 'available_cents')::bigint = greatest(0, (:'f2'::jsonb ->> 'balance_cents')::bigint - 2000));
select public.save_product(null, '{"name": "Next Pod", "price_cents": 1000}') as np \gset
select public.receive_batch(format('{"shipping_cents": 300, "items": [{"product_id": "%s", "qty": 4, "unit_cost_cents": 300}]}', :'np')::jsonb);
select public.company_funds() as f3 \gset
select pg_temp.check('the next batch uses what was kept (₱12 goods + ₱3 shipping of ₱20), then asks again',
  (:'f3'::jsonb ->> 'set_aside_used_cents')::bigint = 1500 and (:'f3'::jsonb ->> 'kept_cents')::bigint = 500
  and (:'f3'::jsonb ->> 'needs_decision')::boolean
  and (:'f3'::jsonb ->> 'balance_cents')::bigint = (:'f2'::jsonb ->> 'balance_cents')::bigint - 1500);
select pg_temp.expect_error('the amount kept is checked', $$select public.set_restock_set_aside(-1)$$, '₱0 or more');
select public.update_batch_payment((select id from public.batch_payments where batch_id = :'fb'),
  format('{"amount_cents": 3500, "source": "investment", "paid_on": "%s"}', public.manila_today())::jsonb);
select pg_temp.check('a batch paid with an investment isn''t charged to the funds',
  (public.company_funds() ->> 'stock_paid_cents')::bigint = (:'f3'::jsonb ->> 'stock_paid_cents')::bigint - 3500);
select public.update_batch_payment((select id from public.batch_payments where batch_id = :'fb'),
  format('{"amount_cents": 3500, "source": "company", "paid_on": "%s"}', public.manila_today())::jsonb);
select pg_temp.expect_error('manager can''t release profits', $$select public.release_profits(100)$$, 'Only the owner');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- A big sale so the test shop has profit above the reserve.
select public.save_product(null, format('{"name": "Big Pod", "price_cents": 10000000, "opening_qty": 1, "batch_id": "%s"}', :'fb')::jsonb) as bigp \gset
select public.complete_sale(format('{"client_ref": "eeeeeeee-0000-0000-0000-000000000002", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'bigp')::jsonb);
select (public.company_funds() ->> 'available_cents')::bigint as avail \gset
select pg_temp.check('a paid sale adds to what''s available', :avail > 4000);
select pg_temp.expect_error('can''t release more than is available', format($$select public.release_profits(%s)$$, :avail + 1), 'safe to distribute');
select public.release_profits(4000, 'Batch 1 profit') as rel \gset
select pg_temp.check('a release is split by the profit split (3 : 1 here) and comes off what''s available',
  (select owner_cents = 3000 and manager_cents = 1000 and note = 'Batch 1 profit' from public.fund_releases where id = :'rel')
  and (public.company_funds() ->> 'available_cents')::bigint = :avail - 4000
  and (public.company_funds() ->> 'owner_released_cents')::bigint = 3000);
select public.update_fund_release(:'rel', 3000, ' Edited ', public.manila_today() - 1);
select pg_temp.check('owner edits a distribution: amount, date, note, split redone at today''s split',
  (select amount_cents = 3000 and owner_cents = 2250 and manager_cents = 750 and note = 'Edited' and released_on = public.manila_today() - 1
     from public.fund_releases where id = :'rel'));
select pg_temp.expect_error('an edited distribution must still be safe',
  format($$select public.update_fund_release('%s', %s, null, public.manila_today())$$, :'rel',
         3000 + (public.finance_report(current_date, current_date) -> 'now' ->> 'safe_to_distribute')::numeric::bigint + 1), 'safe to distribute');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect_error('manager can''t edit distributions', format($$select public.update_fund_release('%s', 100, null, public.manila_today())$$, :'rel'), 'Only the owner');
select public.update_batch_details(:'fb', format('{"supplier": " New Supply ", "received_on": "%s", "note": ""}', public.manila_today() - 1)::jsonb);
select pg_temp.check('manager edits a batch''s supplier, date and note',
  (select supplier = 'New Supply' and received_on = public.manila_today() - 1 and note is null from public.stock_batches where id = :'fb'));
select pg_temp.expect_error('a batch date can''t be in the future',
  format($$select public.update_batch_details('%s', '{"received_on": "%s"}')$$, :'fb', public.manila_today() + 1), 'last 400 days');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff can''t edit batches', format($$select public.update_batch_details('%s', '{"received_on": "%s"}')$$, :'fb', public.manila_today()), 'Only owners and managers');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.delete_fund_release(:'rel');
select pg_temp.check('owner can undo a release', not exists (select 1 from public.fund_releases where id = :'rel'));
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('staff see no funds', public.company_funds() is null and (select count(*) = 0 from public.fund_releases)
  and (select count(*) = 0 from public.fund_set_asides));
select pg_temp.expect_error('staff can''t decide the restock budget', $$select public.set_restock_set_aside(100)$$, 'Only owners and managers');
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

-- ───────── Finance: statements, owner capital, tax, payout limit ─────────
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as fin \gset
select pg_temp.check('finance: the balance adds up (cash + receivables + stock + stock on the way = tax owed + owed to suppliers + capital + profit kept)',
  ((:'fin'::jsonb -> 'end' ->> 'cash')::numeric + (:'fin'::jsonb -> 'end' ->> 'receivables')::numeric + (:'fin'::jsonb -> 'end' ->> 'inventory')::numeric
   + (:'fin'::jsonb -> 'end' ->> 'on_the_way')::numeric)
  = ((:'fin'::jsonb -> 'end' ->> 'tax_payable')::numeric + (:'fin'::jsonb -> 'end' ->> 'owed_suppliers')::numeric
     + (:'fin'::jsonb -> 'end' ->> 'capital')::numeric + (:'fin'::jsonb -> 'end' ->> 'retained')::numeric));
select pg_temp.check('finance: a period from before the first sale starts at zero',
  (:'fin'::jsonb -> 'start' ->> 'net')::numeric = 0 and (:'fin'::jsonb -> 'start' ->> 'cash')::numeric = 0);
select pg_temp.check('finance: net sales and receivables match the sales',
  (:'fin'::jsonb -> 'end' ->> 'net')::bigint = (select sum(total_cents) from public.sales where status = 'completed')
  and (:'fin'::jsonb -> 'end' ->> 'receivables')::bigint = (select sum(balance_cents) from public.sales where status = 'completed'));
select pg_temp.check('finance: cash = the old fund balance (no capital put in yet)',
  (:'fin'::jsonb -> 'end' ->> 'cash')::numeric = (public.company_funds() ->> 'balance_cents')::numeric);
select pg_temp.check('finance: the earlier-stock batch, paid with the owners'' money, counts as owner capital',
  (:'fin'::jsonb -> 'end' ->> 'capital')::numeric = (:'fin'::jsonb -> 'end' ->> 'paid_owner')::numeric + (:'fin'::jsonb -> 'end' ->> 'paid_investment')::numeric
  and (:'fin'::jsonb -> 'end' ->> 'paid_owner')::numeric > 0);
select pg_temp.check('finance: tax is 3% of net sales',
  (:'fin'::jsonb -> 'end' ->> 'tax')::numeric = round((:'fin'::jsonb -> 'end' ->> 'net')::numeric * 0.03));
select pg_temp.check('finance: receivables listed with their age',
  jsonb_array_length(:'fin'::jsonb -> 'receivables') = (select count(*) from public.sales where status = 'completed' and balance_cents > 0));
select public.add_capital(100000, ' Cash top-up ') as cap \gset
select public.add_expense('{"category": "fees", "amount_cents": 1500}') as fee_exp \gset
select public.add_expense('{"category": "tax", "amount_cents": 2000}') as tax_exp \gset
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as fin2 \gset
select pg_temp.check('capital put in adds to cash and capital, not to sales or profit',
  (:'fin2'::jsonb -> 'end' ->> 'capital_cash')::numeric = 100000
  and (:'fin2'::jsonb -> 'end' ->> 'net')::numeric = (:'fin'::jsonb -> 'end' ->> 'net')::numeric
  and (select note = 'Cash top-up' from public.capital_contributions where id = :'cap'));
select pg_temp.check('payment fees are an operating expense; taxes paid are not, they lower tax owed',
  (:'fin2'::jsonb -> 'end' ->> 'opex')::numeric = (:'fin'::jsonb -> 'end' ->> 'opex')::numeric + 1500
  and (:'fin2'::jsonb -> 'end' ->> 'tax_payable')::numeric = (:'fin'::jsonb -> 'end' ->> 'tax_payable')::numeric - 2000
  and (:'fin2'::jsonb -> 'end' ->> 'cash')::numeric = (:'fin'::jsonb -> 'end' ->> 'cash')::numeric + 100000 - 1500 - 2000);
select pg_temp.check('the balance still adds up',
  ((:'fin2'::jsonb -> 'end' ->> 'cash')::numeric + (:'fin2'::jsonb -> 'end' ->> 'receivables')::numeric + (:'fin2'::jsonb -> 'end' ->> 'inventory')::numeric
   + (:'fin2'::jsonb -> 'end' ->> 'on_the_way')::numeric)
  = ((:'fin2'::jsonb -> 'end' ->> 'tax_payable')::numeric + (:'fin2'::jsonb -> 'end' ->> 'owed_suppliers')::numeric
     + (:'fin2'::jsonb -> 'end' ->> 'capital')::numeric + (:'fin2'::jsonb -> 'end' ->> 'retained')::numeric));
select pg_temp.check('safe to distribute = the lower of profit kept and spare cash (cash − tax owed − owed to suppliers − inventory reserve)',
  (:'fin2'::jsonb -> 'now' ->> 'safe_to_distribute')::numeric = greatest(0, least((:'fin2'::jsonb -> 'now' ->> 'retained')::numeric,
     (:'fin2'::jsonb -> 'now' ->> 'cash')::numeric - (:'fin2'::jsonb -> 'now' ->> 'tax_reserve')::numeric
     - (:'fin2'::jsonb -> 'now' ->> 'supplier_reserve')::numeric - (:'fin2'::jsonb -> 'now' ->> 'inventory_reserve')::numeric)));
select (:'fin2'::jsonb -> 'now' ->> 'safe_to_distribute')::numeric::bigint as safe \gset
select pg_temp.expect_error('can''t distribute more than is safe', format($$select public.release_profits(%s)$$, :safe + 1), 'safe to distribute');
select public.set_tax_rate(0);
select pg_temp.check('owner sets the tax rate (0 = none)',
  (public.finance_report(public.manila_today(), public.manila_today()) -> 'end' ->> 'tax')::numeric = 0);
select public.set_tax_rate(300);
select pg_temp.expect_error('tax rate is checked', $$select public.set_tax_rate(5000)$$, '0% to 30%');
select public.update_capital(:'cap', 200000, ' Edited capital ', public.manila_today() - 2);
select pg_temp.check('owner edits capital put in',
  (select amount_cents = 200000 and note = 'Edited capital' and put_in_on = public.manila_today() - 2 from public.capital_contributions where id = :'cap'));
select public.update_expense(:'fee_exp', format('{"category": "rent", "amount_cents": 1700, "spent_on": "%s", "note": " Shop rent ", "batch_id": ""}', public.manila_today() - 1)::jsonb);
select pg_temp.check('owner edits an expense: type, amount, date, note',
  (select category = 'rent' and amount_cents = 1700 and spent_on = public.manila_today() - 1 and note = 'Shop rent' and batch_id is null from public.expenses where id = :'fee_exp'));
select pg_temp.expect_error('expense edits are checked', format($$select public.update_expense('%s', '{"category": "bribe", "amount_cents": 1, "spent_on": "%s"}')$$, :'fee_exp', public.manila_today()), 'what the expense was for');
select public.delete_capital(:'cap');
select pg_temp.check('owner removes a capital entry', not exists (select 1 from public.capital_contributions where id = :'cap'));
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('manager sees the finances', public.finance_report(public.manila_today(), public.manila_today()) is not null);
select pg_temp.expect_error('manager can''t record capital', $$select public.add_capital(100)$$, 'Only the owner');
select pg_temp.expect_error('manager can''t edit capital', format($$select public.update_capital('%s', 100, null, current_date)$$, gen_random_uuid()), 'Only the owner');
select pg_temp.expect_error('manager can''t change the tax rate', $$select public.set_tax_rate(100)$$, 'Only the owner');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff can''t see the finances', $$select public.finance_report(current_date, current_date)$$, 'Only owners and managers');
select pg_temp.expect_error('staff can''t edit expenses', format($$select public.update_expense('%s', '{}')$$, :'tax_exp'), 'Only owners and managers');
select pg_temp.check('staff see no capital entries', (select count(*) = 0 from public.capital_contributions));
select pg_temp.expect_error('staff can''t call the internal totals', $$select public.finance_totals(current_date)$$, 'permission denied');

-- ───────── Finance: each batch's running statement, and the register ─────────
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.save_product(null, '{"name": "Statement Pod", "price_cents": 10000}') as sp \gset
select public.receive_batch(format('{"supplier": "S", "shipping_cents": 1000, "items": [{"product_id": "%s", "qty": 10, "unit_cost_cents": 4000}]}', :'sp')::jsonb) as sb \gset
select public.complete_sale(format('{"client_ref": "abababab-0000-0000-0000-000000000001", "payment_method": "gcash", "discount_cents": 2000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 4}]}', :'sp')::jsonb) is not null as sold_st1 \gset
select public.complete_sale(format('{"client_ref": "abababab-0000-0000-0000-000000000002", "payment_method": "unpaid", "customer_name": "Bea", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'sp')::jsonb) is not null as sold_st2 \gset
select public.adjust_stock(:'sp', 'waste', 1, null, 'Cracked', :'sb');
select pg_temp.check('batch statement: pieces received, sold, lost and left',
  (select received = 10 and sold = 5 and adjusted = -1 and left_pcs = 4 and uncosted = 0 from public.batch_statements() where batch_id = :'sb'));
select pg_temp.check('batch statement: gross sales − discounts = net sales, and what is still owed',
  (select gross_cents = 50000 and discount_cents = 2000 and net_cents = 48000 and owed_cents = 10000 from public.batch_statements() where batch_id = :'sb'));
select pg_temp.check('batch statement: cost of the pieces sold = goods + their share of the restocking fees',
  (select cogs_goods_cents = 20000 and cogs_fees_cents = 500 and goods_cents = 40000 and fees_cents = 1000 from public.batch_statements() where batch_id = :'sb'));
select pg_temp.check('batch statement: a lost piece is charged at landed cost; the rest is on the shelf at landed cost and today''s price',
  (select count_diffs_cents = -4100 and stock_cents = 16400 and left_value_cents = 40000 and left_cost_cents = 16400 from public.batch_statements() where batch_id = :'sb'));
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as fin3 \gset
select pg_temp.check('batch statements add up to Finance: cost of goods sold, count differences and stock',
  (select abs(sum(cogs_goods_cents + cogs_fees_cents) - (:'fin3'::jsonb -> 'end' ->> 'cogs')::numeric) <= count(*)
      and abs(sum(count_diffs_cents) - (:'fin3'::jsonb -> 'end' ->> 'count_diffs')::numeric) <= count(*)
      and abs(sum(stock_cents) - (:'fin3'::jsonb -> 'end' ->> 'inventory')::numeric) <= count(*)
     from public.batch_statements()));
-- Sales of a product since removed, or of pieces sold beyond the stock count, belong to no batch.
select pg_temp.check('batch statements never count more sales than Finance, and gross − discounts = net in every batch',
  (select sum(net_cents) <= (:'fin3'::jsonb -> 'end' ->> 'net')::numeric and sum(net_cents) > 0
      and bool_and(gross_cents - discount_cents = net_cents and discount_cents >= 0)
     from public.batch_statements()));
select pg_temp.check('batch statements: exactly one row per batch',
  (select count(*) filter (where batch_id is not null) = (select count(*) from public.stock_batches)
      and count(distinct batch_id) = (select count(*) from public.stock_batches) and count(*) filter (where batch_id is null) <= 1
     from public.batch_statements()));
select pg_temp.check('batch statements agree with batch sales on pieces, net sales and what is owed, batch by batch',
  (select bool_and(s.received = b.received and s.sold = b.sold and abs(s.net_cents - b.sales) <= b.n and abs(s.owed_cents - b.owed) <= b.n)
     from public.batch_statements() s
     join (select batch_id, count(*) as n, sum(received) as received, sum(sold) as sold, sum(sales_cents) as sales, sum(owed_cents) as owed
             from public.batch_sales() group by batch_id) b on b.batch_id is not distinct from s.batch_id));
-- Stock that came in before batches were recorded has no batch: it gets its own row.
reset role;
insert into public.products (id, name, price_cents, on_hand) values ('99999999-0000-4000-8000-000000000001', 'Loose Pod', 5000, 2);
insert into public.stock_movements (product_id, kind, delta, on_hand_after, unit_cost_cents) values ('99999999-0000-4000-8000-000000000001', 'opening', 2, 2, 2000);
select pg_temp.check('nobody signed out can call the batch statements', not has_function_privilege('anon', 'public.batch_statements()', 'execute'));
set role authenticated;
select public.complete_sale('{"client_ref": "abababab-0000-0000-0000-000000000003", "payment_method": "gcash", "age_verified": true, "items": [{"product_id": "99999999-0000-4000-8000-000000000001", "quantity": 1}]}'::jsonb) is not null as sold_st3 \gset
select pg_temp.check('batch statements: stock from before batches has one row of its own, with no fees',
  (select count(*) = 1 and bool_and(received = 2 and sold = 1 and left_pcs = 1 and net_cents = 5000 and cogs_goods_cents = 2000 and cogs_fees_cents = 0
            and fees_cents = 0 and stock_cents = 2000 and left_cost_cents = 2000 and left_value_cents = 5000)
     from public.batch_statements() where batch_id is null));
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as fin3 \gset
select pg_temp.check('register: cash received + capital − everything paid out (stock paid from the fund, expenses, taxes, distributions) = what the register should hold',
  (select (r ->> 'expected')::numeric = (r ->> 'cash_received')::numeric + (r ->> 'capital_cash')::numeric - (r ->> 'stock')::numeric
            - (r ->> 'expenses')::numeric - (r ->> 'tax_paid')::numeric - (r ->> 'distributions')::numeric
     from (select :'fin3'::jsonb -> 'now' -> 'register' as r) x));
select pg_temp.check('register: money paid by GCash, Maya, card or bank is not in the register',
  (select (r ->> 'expected')::numeric + (r ->> 'elsewhere')::numeric - (r ->> 'payment_fees')::numeric = (:'fin3'::jsonb -> 'now' ->> 'cash')::numeric
      and (r ->> 'elsewhere')::numeric > 0 and (r -> 'elsewhere_by_method') ? 'gcash' and not (r -> 'elsewhere_by_method') ? 'cash'
      and (r ->> 'elsewhere')::numeric = (select sum(value::numeric) from jsonb_each_text(r -> 'elsewhere_by_method'))
     from (select :'fin3'::jsonb -> 'now' -> 'register' as r) x));
select (:'fin3'::jsonb -> 'now' -> 'register' ->> 'expected')::numeric as reg0 \gset
select public.complete_sale(format('{"client_ref": "abababab-0000-0000-0000-000000000004", "payment_method": "cash", "tendered_cents": 10000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'sp')::jsonb) is not null as sold_st4 \gset
select pg_temp.check('register: a cash sale adds its total',
  (public.finance_report(public.manila_today(), public.manila_today()) -> 'now' -> 'register' ->> 'expected')::numeric = :reg0 + 10000);
select public.complete_sale(format('{"client_ref": "abababab-0000-0000-0000-000000000005", "payment_method": "maya", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'sp')::jsonb) is not null as sold_st5 \gset
select pg_temp.check('register: a sale paid by Maya leaves it unchanged and shows as money received elsewhere',
  (select (r ->> 'expected')::numeric = :reg0 + 10000 and (r -> 'elsewhere_by_method' ->> 'maya')::numeric >= 10000
     from (select public.finance_report(public.manila_today(), public.manila_today()) -> 'now' -> 'register' as r) x));
select public.add_expense('{"category": "fees", "amount_cents": 300}') is not null as fee_st \gset
select public.add_expense('{"category": "supplies", "amount_cents": 700}') is not null as sup_st \gset
select pg_temp.check('register: payment fees come off the e-wallet or bank, other expenses out of the register',
  (select (n -> 'register' ->> 'expected')::numeric = :reg0 + 10000 - 700 and (n -> 'register' ->> 'payment_fees')::numeric = 300
      and (n -> 'register' ->> 'expected')::numeric + (n -> 'register' ->> 'elsewhere')::numeric - (n -> 'register' ->> 'payment_fees')::numeric = (n ->> 'cash')::numeric
     from (select public.finance_report(public.manila_today(), public.manila_today()) -> 'now' as n) x));
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('manager sees the batch statements', (select count(*) > 0 from public.batch_statements()));
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('staff get no batch statements', (select count(*) = 0 from public.batch_statements()));

-- ───────── Import products from a CSV file (owners and managers) ─────────
select pg_temp.expect_error('staff can''t import products',
  $$select * from public.import_products('[{"row_no": 2, "name": "Nope", "price": "100"}]'::jsonb)$$, 'Only owners and managers');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, '{"brand": "Imp", "name": "Existing", "variant": "Mint", "barcode": "IMP-1", "price_cents": 30000}') is not null as imp_existing \gset
select count(*) as imp_before from public.products \gset
select $j$[
  {"row_no": 2, "category": "Imported Pods", "brand": "Imp", "name": "Pod", "variant": "Mango", "barcode": "IMP-2", "price": "₱1,250.50", "cost": "165", "reorder_at": "3", "for_sale": "yes"},
  {"row_no": 3, "category": "imported pods", "brand": "Imp", "name": "Pod", "variant": "Grape", "price": "340", "for_sale": "no"},
  {"row_no": 4, "category": "Example", "brand": "Example", "name": "Mango", "price": "340"},
  {"row_no": 5, "brand": " imp ", "name": "existing", "variant": "MINT", "price": "300"}
]$j$ as imp_ok \gset
select pg_temp.check('import preview: new rows, a template example row and a product already in the app',
  (select string_agg(row_no || ':' || status, ',' order by row_no) = '2:new,3:new,4:example,5:exists'
      and bool_and(product_id is null) filter (where status <> 'exists') and bool_and(product_id is not null) filter (where status = 'exists')
     from public.import_products(:'imp_ok'::jsonb)));
select pg_temp.check('import preview writes nothing',
  (select count(*) = :imp_before from public.products) and not exists (select 1 from public.categories where lower(name) = 'imported pods'));
select pg_temp.check('import adds only the new rows and returns their ids',
  (select count(*) filter (where status = 'new' and product_id is not null) = 2 and count(*) = 4
     from public.import_products(:'imp_ok'::jsonb, true)));
select pg_temp.check('imported: one new category for both spellings; price, cost, alert, barcode and For sale as written',
  (select count(*) = 1 from public.categories where lower(name) = 'imported pods')
  and (select p.price_cents = 125050 and c.cost_cents = 16500 and p.reorder_at = 3 and p.barcode = 'IMP-2' and p.active and p.on_hand = 0
         and p.category_id = (select id from public.categories where lower(name) = 'imported pods')
         from public.products p join public.product_costs c on c.product_id = p.id where p.brand = 'Imp' and p.variant = 'Mango')
  and (select not p.active and p.reorder_at = 5 and p.price_cents = 34000 and p.barcode is null
              and not exists (select 1 from public.product_costs c where c.product_id = p.id)
         from public.products p where p.brand = 'Imp' and p.variant = 'Grape')
  and (select count(*) = :imp_before + 2 from public.products));
select pg_temp.check('importing the same file again skips every row',
  (select bool_and(status in ('exists', 'example')) from public.import_products(:'imp_ok'::jsonb, true))
  and (select count(*) = :imp_before + 2 from public.products));
select $j$[
  {"row_no": 2, "brand": "Imp", "name": "Fresh", "price": "200"},
  {"row_no": 3, "name": "", "price": "200"},
  {"row_no": 4, "name": "Bad Price", "price": "abc"},
  {"row_no": 5, "name": "Negative", "price": "-5"},
  {"row_no": 6, "name": "Bad Code", "price": "200", "barcode": "bad code!"},
  {"row_no": 7, "name": "Taken Code", "price": "200", "barcode": "IMP-1"},
  {"row_no": 8, "brand": "imp", "name": "fresh", "price": "250"},
  {"row_no": 9, "name": "Sale?", "price": "200", "for_sale": "maybe"},
  {"row_no": 10, "name": "Alert", "price": "200", "reorder_at": "2.5"},
  {"row_no": 11, "name": "Cost", "price": "200", "cost": "free"},
  {"row_no": 12, "name": "Code A", "price": "200", "barcode": "IMP-9"},
  {"row_no": 13, "name": "Code B", "price": "200", "barcode": "IMP-9"},
  {"row_no": 14, "name": "Too Dear", "price": "150000"}
]$j$ as imp_bad \gset
select pg_temp.check('import preview names what to fix on each row',
  (select string_agg(row_no || ':' || status, ',' order by row_no)
            = '2:new,3:error,4:error,5:error,6:error,7:error,8:error,9:error,10:error,11:error,12:new,13:error,14:error'
      and bool_or(row_no = 3 and message like 'Add the product name%') and bool_or(row_no = 4 and message like 'Enter the selling price%')
      and bool_or(row_no = 6 and message like 'Barcodes use%') and bool_or(row_no = 7 and message like 'Another product already has barcode IMP-1%')
      and bool_or(row_no = 8 and message = 'Same product as row 2.') and bool_or(row_no = 9 and message like 'For sale must be yes or no%')
      and bool_or(row_no = 10 and message like 'Low-stock alert%') and bool_or(row_no = 11 and message like 'Enter the cost%')
      and bool_or(row_no = 13 and message = 'Barcode IMP-9 is on row 12 too.') and bool_or(row_no = 14 and message like '%too high%')
     from public.import_products(:'imp_bad'::jsonb)));
select pg_temp.expect_error('a file with any error adds nothing',
  format($$select * from public.import_products(%L::jsonb, true)$$, :'imp_bad'), 'Nothing was added');
select pg_temp.check('nothing from the file with errors was added',
  (select count(*) = :imp_before + 2 from public.products) and not exists (select 1 from public.products where name = 'Fresh'));
-- Files as people type them: commas only between thousands, "P340", doubled spaces, Excel barcodes.
select public.save_product(null, '{"brand": "Imp", "name": "Very Chill", "price_cents": 34000}') is not null as imp_chill \gset
select count(*) as imp_before2 from public.products \gset
select $j$[
  {"row_no": 2, "brand": "Imp", "name": "Comma Decimal", "price": "340,50"},
  {"row_no": 3, "brand": "Imp", "name": "Thousands", "price": "1,250", "cost": "P165", "reorder_at": "1,000"},
  {"row_no": 4, "brand": "Imp", "name": "Peso P", "price": "P340", "cost": "p 165"},
  {"row_no": 5, "brand": "Imp", "name": "Bad Cost", "price": "340", "cost": "165,5"},
  {"row_no": 6, "brand": "Imp", "name": "Bad Alert", "price": "340", "reorder_at": "5,0"},
  {"row_no": 7, "brand": "imp", "name": "Very  Chill", "price": "340"},
  {"row_no": 8, "brand": "Imp", "name": "Excel Code", "price": "340", "barcode": "4.8E+12"},
  {"row_no": 9, "category": "Imported   Pods", "brand": "Imp", "name": "Two  Spaces", "variant": "Ube\nTaro", "price": "340"}
]$j$ as imp_typed \gset
select pg_temp.check('import reads pesos as typed: comma only between thousands, P340; doubled spaces match; Excel barcodes named',
  (select string_agg(row_no || ':' || status, ',' order by row_no) = '2:error,3:new,4:new,5:error,6:error,7:exists,8:error,9:new'
      and bool_or(row_no = 2 and message like 'Enter the selling price%') and bool_or(row_no = 5 and message like 'Enter the cost%')
      and bool_or(row_no = 6 and message like 'Low-stock alert must be a whole number%')
      and bool_or(row_no = 8 and message = 'Excel changed this barcode to 4.8E+12. Set the Barcode column to Text, type the barcode again and save.')
     from public.import_products(:'imp_typed'::jsonb)));
select pg_temp.expect_error('adding a file with errors says how many rows need fixing',
  format($$select * from public.import_products(%L::jsonb, true)$$, :'imp_typed'), 'Nothing was added: 4 rows need fixing (marked Fix this)');
select pg_temp.check('the rows without errors can be added',
  (select count(*) filter (where status = 'new') = 3 and count(*) filter (where status = 'exists') = 1 from public.import_products(
      (select jsonb_agg(e) from jsonb_array_elements(:'imp_typed'::jsonb) e where (e ->> 'row_no')::int in (3, 4, 7, 9)), true)));
select pg_temp.check('they are saved with the amounts as typed, single spaces and the existing category',
  (select p.price_cents = 125000 and c.cost_cents = 16500 and p.reorder_at = 1000
         from public.products p join public.product_costs c on c.product_id = p.id where p.name = 'Thousands')
  and (select p.price_cents = 34000 and c.cost_cents = 16500
         from public.products p join public.product_costs c on c.product_id = p.id where p.name = 'Peso P')
  and (select p.variant = 'Ube Taro' and p.category_id = (select id from public.categories where lower(name) = 'imported pods')
         from public.products p where p.name = 'Two Spaces')
  and (select count(*) = 1 from public.categories where lower(regexp_replace(name, '\s+', ' ', 'g')) = 'imported pods')
  and (select count(*) = 1 from public.products where lower(regexp_replace(name, '\s+', ' ', 'g')) = 'very chill')
  and (select count(*) = :imp_before2 + 3 from public.products));
select pg_temp.expect_error('one row to fix is named in the singular',
  $$select * from public.import_products('[{"row_no": 2, "name": "Lone", "price": "abc"}]'::jsonb, true)$$, 'Nothing was added: 1 row needs fixing');
select pg_temp.expect_error('an empty file is refused', $$select * from public.import_products('[]'::jsonb)$$, 'no products');
select pg_temp.expect_error('more than 500 rows at once is refused',
  $$select * from public.import_products((select jsonb_agg(jsonb_build_object('row_no', g, 'name', 'P' || g, 'price', '1')) from generate_series(1, 501) g))$$,
  'up to 500');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('the owner can import too',
  (select count(*) = 1 and bool_and(status = 'new') from public.import_products('[{"row_no": 2, "brand": "Imp", "name": "Owner Pick", "price": "99"}]'::jsonb, true)));
reset role;
select pg_temp.check('nobody signed out can import products', not has_function_privilege('anon', 'public.import_products(jsonb, boolean)', 'execute'));

-- ───────── Batch report (owner only) ─────────
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, '{"brand": "Rpt", "name": "Mango", "price_cents": 34000}') as rpt_mango \gset
select public.save_product(null, '{"brand": "Rpt", "name": "Grape", "price_cents": 34000}') as rpt_grape \gset
select public.receive_batch(format('{"supplier": "Report Supply", "items": [{"product_id": "%s", "qty": 3, "unit_cost_cents": 16500}, {"product_id": "%s", "qty": 3, "unit_cost_cents": 16500}]}',
  :'rpt_mango', :'rpt_grape')::jsonb) as rpt_batch \gset
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 2, "unit_cost_cents": 16500}]}', :'rpt_grape')::jsonb) as rpt_empty \gset
select public.complete_sale(format('{"client_ref": "cccccccc-0000-4000-8000-000000000001", "payment_method": "cash", "tendered_cents": 68000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 2}]}', :'rpt_mango')::jsonb);
select public.complete_sale(format('{"client_ref": "cccccccc-0000-4000-8000-000000000002", "payment_method": "unpaid", "customer_name": "  Ana  Cruz ", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'rpt_grape')::jsonb) as rpt_owe1 \gset
select public.complete_sale(format('{"client_ref": "cccccccc-0000-4000-8000-000000000003", "payment_method": "unpaid", "customer_name": "ana cruz", "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'rpt_mango')::jsonb);
select public.record_payment((:'rpt_owe1'::jsonb ->> 'id')::uuid, 10000, 'gcash');
select pg_temp.expect_error('managers can''t see batch reports', format($$select public.batch_report('%s')$$, :'rpt_batch'), 'Only the owner');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff can''t see batch reports', format($$select public.batch_report('%s')$$, :'rpt_batch'), 'Only the owner');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.batch_report(:'rpt_batch') as rpt \gset
select pg_temp.check('batch report: the batch, and each day''s pieces with the running pieces and net sales',
  (:'rpt'::jsonb ->> 'batch_no')::int = (select batch_no from public.stock_batches where id = :'rpt_batch')
  and :'rpt'::jsonb ->> 'supplier' = 'Report Supply' and (:'rpt'::jsonb ->> 'today')::date = public.manila_today()
  and jsonb_array_length(:'rpt'::jsonb -> 'days') = 1
  and (:'rpt'::jsonb -> 'days' -> 0) = jsonb_build_object('date', public.manila_today(), 'pcs', 4, 'cum_pcs', 4, 'cum_net_cents', 136000));
select pg_temp.check('batch report: each flavour''s pieces received, sold and left, and its last sale',
  (select bool_and(case f ->> 'name'
                     when 'Mango' then (f ->> 'received')::int = 3 and (f ->> 'sold')::int = 3 and (f ->> 'left')::int = 0
                                       and (f ->> 'last_sale_on')::date = public.manila_today()
                     when 'Grape' then (f ->> 'received')::int = 3 and (f ->> 'sold')::int = 1 and (f ->> 'left')::int = 2
                     else false end) and count(*) = 2
     from jsonb_array_elements(:'rpt'::jsonb -> 'flavours') f));
select pg_temp.check('batch report: who still owes, one line per buyer however the name was typed',
  (:'rpt'::jsonb -> 'owed') = '[{"buyer": "Ana Cruz", "cents": 58000, "sales": 2}]'::jsonb);
select pg_temp.check('batch report: what was collected, by method',
  (select jsonb_object_agg(p ->> 'method', (p ->> 'cents')::int) from jsonb_array_elements(:'rpt'::jsonb -> 'paid') p)
    = '{"cash": 68000, "gcash": 10000}'::jsonb);
select pg_temp.check('batch report ties out to the batch''s statement: net sales, still owed, and paid = net − owed',
  (select net_cents = 136000 and owed_cents = 58000 from public.batch_statements() where batch_id = :'rpt_batch')
  and (select sum((p ->> 'cents')::int) from jsonb_array_elements(:'rpt'::jsonb -> 'paid') p) = 136000 - 58000);
select pg_temp.check('batch report: a batch with nothing sold yet has no days, nothing owed and its pieces left',
  (select (r -> 'days') = '[]'::jsonb and (r -> 'owed') = '[]'::jsonb and (r -> 'paid') = '[]'::jsonb
          and (r -> 'flavours' -> 0 ->> 'received')::int = 2 and (r -> 'flavours' -> 0 ->> 'left')::int = 2
     from (select public.batch_report(:'rpt_empty') as r) x));
reset role;
update public.stock_batches set received_on = received_on + 2 where id = :'rpt_batch';
set role authenticated;
select pg_temp.check('batch report: sales before an edited received date count on its first day, never before it',
  (select (r -> 'days' -> 0 ->> 'date')::date = public.manila_today() + 2 and (r -> 'days' -> 0 ->> 'cum_pcs')::int = 4
          and jsonb_array_length(r -> 'days') = 1
     from (select public.batch_report(:'rpt_batch') as r) x));
reset role;
update public.stock_batches set received_on = received_on - 2 where id = :'rpt_batch';
set role authenticated;
select pg_temp.expect_error('batch report: an unknown batch', $$select public.batch_report('00000000-0000-4000-8000-000000000000')$$, 'Batch not found');
reset role;
select pg_temp.check('nobody signed out can see batch reports', not has_function_privilege('anon', 'public.batch_report(uuid)', 'execute'));

-- ───────── A batch's received date: changeable any time, not before the order (owners and managers) ─────────
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.set_batch_received_on(:'rpt_batch', public.manila_today() - 3);
select pg_temp.check('a manager can move a batch''s received date; only the date changes',
  (select received_on = public.manila_today() - 3 and supplier = 'Report Supply' from public.stock_batches where id = :'rpt_batch'));
select pg_temp.expect_error('a received date in the future is refused',
  format($$select public.set_batch_received_on('%s', public.manila_today() + 1)$$, :'rpt_batch'), 'last 400 days');
reset role;
update public.stock_movements set created_at = created_at - interval '5 days' where batch_id = :'rpt_batch';
set role authenticated;
select public.set_batch_received_on(:'rpt_batch', public.manila_today() - 1);
select pg_temp.check('a received date after the day its pieces were recorded is fine (entered before it arrived)',
  (select received_on = public.manila_today() - 1 from public.stock_batches where id = :'rpt_batch'));
select public.update_batch_details(:'rpt_batch', format('{"supplier": "Kept", "received_on": "%s", "ordered_on": "%s"}', public.manila_today(), public.manila_today() - 4)::jsonb);
select pg_temp.check('supplier, order day and received day are saved together',
  (select supplier = 'Kept' and received_on = public.manila_today() and ordered_on = public.manila_today() - 4 from public.stock_batches where id = :'rpt_batch'));
select pg_temp.expect_error('a batch can''t arrive before it was ordered',
  format($$select public.set_batch_received_on('%s', public.manila_today() - 5)$$, :'rpt_batch'), 'was ordered on');
select pg_temp.expect_error('the same when changing supplier, date and note',
  format($$select public.update_batch_details('%s', '{"supplier": "X", "received_on": "%s"}')$$, :'rpt_batch', public.manila_today() - 5),
  'can''t arrive before it was ordered');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff can''t change a batch''s date',
  format($$select public.set_batch_received_on('%s', public.manila_today() - 6)$$, :'rpt_batch'), 'Only owners and managers');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.update_batch_details(:'rpt_batch', format('{"supplier": "Kept", "received_on": "%s", "ordered_on": ""}', public.manila_today())::jsonb);
select public.set_batch_received_on(:'rpt_batch', public.manila_today() - 6);
select pg_temp.check('the owner can clear the order day and change the date too',
  (select received_on = public.manila_today() - 6 and ordered_on is null from public.stock_batches where id = :'rpt_batch'));
select pg_temp.expect_error('an unknown batch',
  $$select public.set_batch_received_on('00000000-0000-4000-8000-000000000000', public.manila_today())$$, 'no longer exists');
reset role;
select pg_temp.check('nobody signed out can change a batch''s date', not has_function_privilege('anon', 'public.set_batch_received_on(uuid, date)', 'execute'));
select pg_temp.check('nothing reads the old paid-from-funds flag', not exists (select 1 from pg_proc where prosrc ilike '%paid_from_funds%'));

-- ───────── Orders: ordered, paid, arrived (owners and managers) ─────────
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, '{"brand": "Ord", "name": "Lychee", "price_cents": 30000}') as ord_a \gset
select public.save_product(null, '{"brand": "Ord", "name": "Melon", "price_cents": 30000}') as ord_b \gset
select public.set_restock_set_aside(100000, 'For the next order');
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as ofin0 \gset
-- ₱750 + ₱480 of pods and ₱20 shipping = ₱1,250; ₱500 down with the owner's money.
select public.order_batch(format('{"supplier": " Vape Hub ", "ordered_on": "%s", "shipping_cents": 2000,
  "items": [{"product_id": "%s", "qty": 5, "unit_cost_cents": 15000}, {"product_id": "%s", "qty": 3, "unit_cost_cents": 16000}],
  "payment": {"amount_cents": 50000, "source": "owner"}}', public.manila_today() - 3, :'ord_a', :'ord_b')::jsonb) as ord \gset
select pg_temp.check('an order waits off the shelf: numbered, its order day, not arrived, its lines, no stock',
  (select batch_no = (select max(batch_no) from public.stock_batches) and supplier = 'Vape Hub'
          and ordered_on = public.manila_today() - 3 and received_on is null from public.stock_batches where id = :'ord')
  and (select count(*) = 2 and sum(qty) = 8 from public.batch_order_lines where batch_id = :'ord')
  and (select sum(on_hand) = 0 from public.products where id in (:'ord_a', :'ord_b'))
  and not exists (select 1 from public.stock_movements where batch_id = :'ord'));
select pg_temp.check('the downpayment is recorded on the order day, with whose money',
  (select count(*) = 1 and sum(amount_cents) = 50000 and bool_and(source = 'owner' and paid_on = public.manila_today() - 3)
     from public.batch_payments where batch_id = :'ord'));
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as ofin1 \gset
select pg_temp.check('finance: the order is stock on the way, the rest is owed to the supplier, the owner''s money is capital; cash unchanged',
  (:'ofin1'::jsonb -> 'end' ->> 'on_the_way')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'on_the_way')::numeric + 125000
  and (:'ofin1'::jsonb -> 'end' ->> 'owed_suppliers')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'owed_suppliers')::numeric + 75000
  and (:'ofin1'::jsonb -> 'end' ->> 'capital')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'capital')::numeric + 50000
  and (:'ofin1'::jsonb -> 'end' ->> 'cash')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'cash')::numeric
  and (:'ofin1'::jsonb -> 'end' ->> 'inventory')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'inventory')::numeric);
select pg_temp.check('finance: the balance adds up with an order on the way',
  ((:'ofin1'::jsonb -> 'end' ->> 'cash')::numeric + (:'ofin1'::jsonb -> 'end' ->> 'receivables')::numeric
   + (:'ofin1'::jsonb -> 'end' ->> 'inventory')::numeric + (:'ofin1'::jsonb -> 'end' ->> 'on_the_way')::numeric)
  = ((:'ofin1'::jsonb -> 'end' ->> 'tax_payable')::numeric + (:'ofin1'::jsonb -> 'end' ->> 'owed_suppliers')::numeric
     + (:'ofin1'::jsonb -> 'end' ->> 'capital')::numeric + (:'ofin1'::jsonb -> 'end' ->> 'retained')::numeric));
select public.finance_report(public.manila_today() - 3650, public.manila_today() - 4) -> 'end' as ofin_before \gset
select public.finance_report(public.manila_today() - 3650, public.manila_today() - 3) -> 'end' as ofin_day \gset
select pg_temp.check('finance: the order and its downpayment count from the order day, not before',
  (:'ofin_day'::jsonb ->> 'on_the_way')::numeric - (:'ofin_before'::jsonb ->> 'on_the_way')::numeric = 125000
  and (:'ofin_day'::jsonb ->> 'paid_owner')::numeric - (:'ofin_before'::jsonb ->> 'paid_owner')::numeric = 50000
  and (:'ofin_day'::jsonb ->> 'owed_suppliers')::numeric - (:'ofin_before'::jsonb ->> 'owed_suppliers')::numeric = 75000);
select pg_temp.check('spare cash keeps back what is owed to suppliers',
  (:'ofin1'::jsonb -> 'now' ->> 'supplier_reserve')::numeric = greatest(0, (:'ofin1'::jsonb -> 'end' ->> 'owed_suppliers')::numeric)
  and (:'ofin1'::jsonb -> 'now' ->> 'spare_cash')::numeric = (:'ofin1'::jsonb -> 'now' ->> 'cash')::numeric
      - (:'ofin1'::jsonb -> 'now' ->> 'tax_reserve')::numeric - (:'ofin1'::jsonb -> 'now' ->> 'supplier_reserve')::numeric
      - (:'ofin1'::jsonb -> 'now' ->> 'inventory_reserve')::numeric);
select pg_temp.check('finance lists the order with what is paid and owed',
  exists (select 1 from jsonb_array_elements(:'ofin1'::jsonb -> 'suppliers') e
           where e ->> 'batch_id' = :'ord' and (e ->> 'on_the_way')::boolean and (e ->> 'cost_cents')::int = 125000
             and (e ->> 'paid_cents')::int = 50000 and (e ->> 'owed_cents')::int = 75000));
select pg_temp.check('the company''s part of the order uses what was kept for the next restock, and Finance asks again',
  (public.company_funds() ->> 'set_aside_used_cents')::int = 75000 and (public.company_funds() ->> 'kept_cents')::int = 25000
  and (public.company_funds() ->> 'needs_decision')::boolean);
select pg_temp.expect_error('no stock goes into a batch on the way',
  format($$select public.adjust_stock('%s', 'restock', 1, null, null, '%s')$$, :'ord_a', :'ord'), 'still on the way');
select pg_temp.expect_error('nor a new product''s starting pieces',
  format($$select public.save_product(null, '{"name": "Early", "price_cents": 100, "opening_qty": 2, "batch_id": "%s"}')$$, :'ord'), 'still on the way');
select pg_temp.expect_error('its received date waits for Arrived',
  format($$select public.set_batch_received_on('%s', public.manila_today())$$, :'ord'), 'hasn''t arrived yet');
select public.update_batch_details(:'ord', format('{"supplier": "Vape Hub", "ordered_on": "%s", "note": "PO 12"}', public.manila_today() - 2)::jsonb);
select pg_temp.check('an order''s supplier, order day and note can be changed',
  (select ordered_on = public.manila_today() - 2 and note = 'PO 12' and received_on is null from public.stock_batches where id = :'ord'));
select pg_temp.expect_error('a payment can''t be more than is still owed',
  format($$select public.add_batch_payment('%s', '{"amount_cents": 80000, "source": "company"}')$$, :'ord'), 'Only ₱750.00 is still to pay');
select pg_temp.expect_error('whose money paid is checked',
  format($$select public.add_batch_payment('%s', '{"amount_cents": 100, "source": "friend"}')$$, :'ord'), 'Pick whose money paid');
select pg_temp.expect_error('it can''t arrive before it was ordered',
  format($$select public.arrive_batch('%s', '{"received_on": "%s"}')$$, :'ord', public.manila_today() - 3), 'was ordered on');
select pg_temp.expect_error('something has to arrive',
  format($$select public.arrive_batch('%s', '{"items": [{"line_id": "%s", "qty": 0}, {"line_id": "%s", "qty": 0}]}')$$, :'ord',
    (select id from public.batch_order_lines where batch_id = :'ord' and product_id = :'ord_a'),
    (select id from public.batch_order_lines where batch_id = :'ord' and product_id = :'ord_b')), 'at least one product');
select pg_temp.check('a refused arrival changes nothing',
  (select received_on is null from public.stock_batches where id = :'ord') and not exists (select 1 from public.stock_movements where batch_id = :'ord'));
-- Arrived yesterday, one Melon short, the rest paid on pick-up from the company fund.
select public.arrive_batch(:'ord', format('{"received_on": "%s", "items": [{"line_id": "%s", "qty": 2}], "payment": {"amount_cents": 59000, "source": "company"}}',
  public.manila_today() - 1, (select id from public.batch_order_lines where batch_id = :'ord' and product_id = :'ord_b'))::jsonb);
select pg_temp.check('Arrived puts what came on the shelf (one short) as restocks in the batch, at the ordered cost',
  (select received_on = public.manila_today() - 1 from public.stock_batches where id = :'ord')
  and (select on_hand = 5 from public.products where id = :'ord_a') and (select on_hand = 2 from public.products where id = :'ord_b')
  and (select count(*) = 2 and sum(delta) = 7 and bool_and(kind = 'restock') from public.stock_movements where batch_id = :'ord')
  and (select cost_cents = 15000 from public.product_costs where product_id = :'ord_a')
  and (select qty = 3 from public.batch_order_lines where batch_id = :'ord' and product_id = :'ord_b'));
select pg_temp.check('what was paid on pick-up is recorded on the arrival day',
  (select count(*) = 1 from public.batch_payments where batch_id = :'ord' and source = 'company' and amount_cents = 59000 and paid_on = public.manila_today() - 1));
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as ofin2 \gset
select pg_temp.check('finance: arrived, it is inventory at what came (₱750 + ₱320 + ₱20), fully paid; cash down by the pick-up payment',
  (:'ofin2'::jsonb -> 'end' ->> 'on_the_way')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'on_the_way')::numeric
  and (:'ofin2'::jsonb -> 'end' ->> 'inventory')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'inventory')::numeric + 109000
  and (:'ofin2'::jsonb -> 'end' ->> 'owed_suppliers')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'owed_suppliers')::numeric
  and (:'ofin2'::jsonb -> 'end' ->> 'cash')::numeric = (:'ofin0'::jsonb -> 'end' ->> 'cash')::numeric - 59000
  and not exists (select 1 from jsonb_array_elements(:'ofin2'::jsonb -> 'suppliers') e where e ->> 'batch_id' = :'ord'));
select pg_temp.check('finance: the day before it arrived, it was still on the way',
  (public.finance_report(public.manila_today() - 3650, public.manila_today() - 2) -> 'end' ->> 'on_the_way')::numeric
  = (:'ofin2'::jsonb -> 'end' ->> 'on_the_way')::numeric + 109000);
select pg_temp.expect_error('a batch arrives once', format($$select public.arrive_batch('%s')$$, :'ord'), 'already arrived');
select pg_temp.expect_error('once paid in full, no more payments',
  format($$select public.add_batch_payment('%s', '{"amount_cents": 100, "source": "company"}')$$, :'ord'), 'already paid in full');
-- Put back on the way (tapped Arrived by mistake), then arrived as ordered with nothing paid on pick-up.
select public.undo_batch_arrival(:'ord');
select pg_temp.check('an arrival can be undone while nothing sold: the pieces come off the shelf, what came is the order again, payments stay',
  (select received_on is null and ordered_on = public.manila_today() - 2 from public.stock_batches where id = :'ord')
  and (select sum(on_hand) = 0 from public.products where id in (:'ord_a', :'ord_b'))
  and not exists (select 1 from public.stock_movements where batch_id = :'ord')
  and (select count(*) = 2 and sum(qty) = 7 from public.batch_order_lines where batch_id = :'ord')
  and (select count(*) = 2 from public.batch_payments where batch_id = :'ord'));
select public.arrive_batch(:'ord', format('{"items": [{"line_id": "%s", "qty": 3}]}',
  (select id from public.batch_order_lines where batch_id = :'ord' and product_id = :'ord_b'))::jsonb);
select pg_temp.check('Arrived again, today, with the third Melon: ₱160 still owed for it',
  (select received_on = public.manila_today() from public.stock_batches where id = :'ord')
  and (select on_hand = 3 from public.products where id = :'ord_b')
  and exists (select 1 from jsonb_array_elements(public.finance_report(public.manila_today(), public.manila_today()) -> 'suppliers') e
               where e ->> 'batch_id' = :'ord' and (e ->> 'owed_cents')::int = 16000 and not (e ->> 'on_the_way')::boolean));
select public.add_batch_payment(:'ord', format('{"amount_cents": 16000, "source": "investment", "paid_on": "%s", "note": " Balance "}', public.manila_today())::jsonb) as ord_pay \gset
select pg_temp.check('paying the rest with an investment: paid in full, and it counts as owner capital',
  (select note = 'Balance' and source = 'investment' from public.batch_payments where id = :'ord_pay')
  and not exists (select 1 from jsonb_array_elements(public.finance_report(public.manila_today(), public.manila_today()) -> 'suppliers') e
                   where e ->> 'batch_id' = :'ord')
  and (public.finance_report(public.manila_today(), public.manila_today()) -> 'end' ->> 'capital')::numeric
      = (:'ofin0'::jsonb -> 'end' ->> 'capital')::numeric + 50000 + 16000);
select public.update_batch_payment(:'ord_pay', format('{"amount_cents": 10000, "source": "company", "paid_on": "%s"}', public.manila_today())::jsonb);
select pg_temp.check('a payment can be changed', (select amount_cents = 10000 and source = 'company' and note is null from public.batch_payments where id = :'ord_pay'));
select pg_temp.expect_error('a changed payment is still at most what is owed',
  format($$select public.update_batch_payment('%s', '{"amount_cents": 16001, "source": "company"}')$$, :'ord_pay'), 'Only ₱160.00');
select public.delete_batch_payment(:'ord_pay');
select pg_temp.check('and removed', not exists (select 1 from public.batch_payments where id = :'ord_pay'));
select public.complete_sale(format('{"client_ref": "dddddddd-0000-4000-8000-000000000001", "payment_method": "cash", "tendered_cents": 30000, "age_verified": true, "items": [{"product_id": "%s", "quantity": 1}]}', :'ord_a')::jsonb);
select pg_temp.expect_error('once a piece sold, the batch can''t go back on the way',
  format($$select public.undo_batch_arrival('%s')$$, :'ord'), 'were sold');
-- A delivery received in one step, not paid yet; then reserved pieces stop it going back on the way.
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 4, "unit_cost_cents": 15000}], "payment": {"amount_cents": 0}}', :'ord_b')::jsonb) as ord_rcv \gset
select pg_temp.check('a delivery received with nothing paid yet is owed in full',
  not exists (select 1 from public.batch_payments where batch_id = :'ord_rcv')
  and exists (select 1 from jsonb_array_elements(public.finance_report(public.manila_today(), public.manila_today()) -> 'suppliers') e
               where e ->> 'batch_id' = :'ord_rcv' and (e ->> 'owed_cents')::int = 60000));
select public.reserve_product(format('{"product_id": "%s", "customer_name": "Lia", "qty": 6}', :'ord_b')::jsonb) as ord_res \gset
select pg_temp.expect_error('reserved pieces stop a batch going back on the way',
  format($$select public.undo_batch_arrival('%s')$$, :'ord_rcv'), 'reserved or no longer on the shelf');
select public.close_reservation(:'ord_res');
select public.undo_batch_arrival(:'ord_rcv');
select pg_temp.check('a batch received in one step goes back on the way as an order of what came, dated the day it arrived',
  (select received_on is null and ordered_on = public.manila_today() from public.stock_batches where id = :'ord_rcv')
  and (select count(*) = 1 and sum(qty) = 4 and min(unit_cost_cents) = 15000 from public.batch_order_lines where batch_id = :'ord_rcv')
  and (select on_hand = 3 from public.products where id = :'ord_b'));
select pg_temp.check('its statement shows what it was ordered at and nothing on the shelf',
  (select goods_cents = 60000 and received = 0 and stock_cents = 0 from public.batch_statements() where batch_id = :'ord_rcv'));
select public.add_batch_payment(:'ord_rcv', '{"amount_cents": 1000, "source": "company"}') as rcv_pay \gset
select pg_temp.expect_error('an order with money paid on it can''t be removed', format($$select public.delete_batch_order('%s')$$, :'ord_rcv'), 'Remove its payments first');
select pg_temp.expect_error('an arrived batch isn''t removed as an order', format($$select public.delete_batch_order('%s')$$, :'ord'), 'already arrived');
select public.delete_batch_payment(:'rcv_pay');
select public.delete_batch_order(:'ord_rcv');
select pg_temp.check('a cancelled order is removed with its lines',
  not exists (select 1 from public.stock_batches where id = :'ord_rcv') and not exists (select 1 from public.batch_order_lines where batch_id = :'ord_rcv'));
-- Paid in full when ordered: "rest" is the whole cost.
select public.order_batch(format('{"shipping_cents": 500, "items": [{"product_id": "%s", "qty": 2, "unit_cost_cents": 15000}], "payment": {"amount_cents": "rest", "source": "company"}}', :'ord_b')::jsonb) as ord_full \gset
select pg_temp.check('an order paid in full when ordered: one payment of its whole cost',
  (select count(*) = 1 and sum(amount_cents) = 30500 and bool_and(source = 'company') from public.batch_payments where batch_id = :'ord_full'));
select public.arrive_batch(:'ord_full', '{"payment": {"amount_cents": "rest", "source": "company"}}');
select pg_temp.check('nothing more to pay on pick-up when it was paid in full',
  (select count(*) = 1 from public.batch_payments where batch_id = :'ord_full'));
-- An order to pay on pick-up.
select public.order_batch(format('{"items": [{"product_id": "%s", "qty": 2, "unit_cost_cents": 15000}]}', :'ord_a')::jsonb) as ord_cop \gset
select pg_temp.check('an order to pay on pick-up has no payments, is ordered today and owed in full',
  not exists (select 1 from public.batch_payments where batch_id = :'ord_cop')
  and (select ordered_on = public.manila_today() from public.stock_batches where id = :'ord_cop')
  and exists (select 1 from jsonb_array_elements(public.finance_report(public.manila_today(), public.manila_today()) -> 'suppliers') e
               where e ->> 'batch_id' = :'ord_cop' and (e ->> 'owed_cents')::int = 30000 and (e ->> 'on_the_way')::boolean));
select pg_temp.expect_error('an order date in the future is refused',
  format($$select public.order_batch('{"ordered_on": "%s", "items": [{"product_id": "%s", "qty": 1}]}')$$, public.manila_today() + 1, :'ord_a'), 'last 60 days');
select pg_temp.expect_error('an order needs pieces', $$select public.order_batch('{"items": []}')$$, 'at least one product');
select pg_temp.expect_error('an order can''t pay more than it costs',
  format($$select public.order_batch('{"items": [{"product_id": "%s", "qty": 1, "unit_cost_cents": 100}], "payment": {"amount_cents": 101}}')$$, :'ord_a'), 'Only ₱1.00');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.expect_error('a batch on the way has no report yet', format($$select public.batch_report('%s')$$, :'ord_cop'), 'hasn''t arrived yet');
select public.batch_report(:'ord') as ord_rpt \gset
select pg_temp.check('the batch report says when it was ordered, what it cost and whose money paid',
  (:'ord_rpt'::jsonb ->> 'ordered_on')::date = public.manila_today() - 2 and (:'ord_rpt'::jsonb ->> 'cost_cents')::int = 125000
  and (:'ord_rpt'::jsonb ->> 'paid_owner_cents')::int = 50000 and (:'ord_rpt'::jsonb ->> 'paid_company_cents')::int = 59000
  and (:'ord_rpt'::jsonb ->> 'paid_investment_cents')::int = 0);
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as ofin3 \gset
select pg_temp.check('finance: the balance adds up with orders on the way, paid in parts and owed',
  ((:'ofin3'::jsonb -> 'end' ->> 'cash')::numeric + (:'ofin3'::jsonb -> 'end' ->> 'receivables')::numeric
   + (:'ofin3'::jsonb -> 'end' ->> 'inventory')::numeric + (:'ofin3'::jsonb -> 'end' ->> 'on_the_way')::numeric)
  = ((:'ofin3'::jsonb -> 'end' ->> 'tax_payable')::numeric + (:'ofin3'::jsonb -> 'end' ->> 'owed_suppliers')::numeric
     + (:'ofin3'::jsonb -> 'end' ->> 'capital')::numeric + (:'ofin3'::jsonb -> 'end' ->> 'retained')::numeric)
  and (:'ofin3'::jsonb -> 'end' ->> 'on_the_way')::numeric > 0 and (:'ofin3'::jsonb -> 'end' ->> 'owed_suppliers')::numeric > 0);
select pg_temp.check('batch statements still add up to Finance''s stock on the shelf',
  (select abs(sum(stock_cents) - (:'ofin3'::jsonb -> 'end' ->> 'inventory')::numeric) <= count(*) from public.batch_statements()));
select pg_temp.check('every period adds up too: cash flow from opening to closing, and a month''s balance',
  (select bool_and(
     ((r -> 'end' ->> 'cash')::numeric + (r -> 'end' ->> 'receivables')::numeric + (r -> 'end' ->> 'inventory')::numeric + (r -> 'end' ->> 'on_the_way')::numeric)
     = ((r -> 'end' ->> 'tax_payable')::numeric + (r -> 'end' ->> 'owed_suppliers')::numeric + (r -> 'end' ->> 'capital')::numeric + (r -> 'end' ->> 'retained')::numeric))
     from (select public.finance_report(public.manila_today() - 3650, public.manila_today() - k) as r from generate_series(0, 5) k) x));
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error('staff can''t order stock', format($$select public.order_batch('{"items": [{"product_id": "%s", "qty": 1}]}')$$, :'ord_a'), 'Only owners and managers');
select pg_temp.expect_error('staff can''t mark an order arrived', format($$select public.arrive_batch('%s')$$, :'ord_cop'), 'Only owners and managers');
select pg_temp.expect_error('staff can''t record supplier payments', format($$select public.add_batch_payment('%s', '{"amount_cents": 100, "source": "company"}')$$, :'ord_cop'), 'Only owners and managers');
select pg_temp.expect_error('staff can''t undo an arrival', format($$select public.undo_batch_arrival('%s')$$, :'ord'), 'Only owners and managers');
select pg_temp.expect_error('staff can''t remove an order', format($$select public.delete_batch_order('%s')$$, :'ord_cop'), 'Only owners and managers');
select pg_temp.check('staff see no order lines or supplier payments',
  (select count(*) = 0 from public.batch_order_lines) and (select count(*) = 0 from public.batch_payments));
select pg_temp.expect_error('staff can''t call the internal batch money', $$select * from public.batch_money()$$, 'permission denied');
select pg_temp.expect_error('nor put a batch back on the way directly', format($$select public.batch_back_on_the_way('%s')$$, :'ord'), 'permission denied');
reset role;
select pg_temp.check('nobody signed out can order, receive or pay',
  not has_function_privilege('anon', 'public.order_batch(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.arrive_batch(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.add_batch_payment(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.undo_batch_arrival(uuid)', 'execute'));

-- ───────── Orders: what the review found ─────────
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.save_product(null, '{"brand": "Rev", "name": "Kiwi", "price_cents": 30000}') as rv_k \gset
select public.save_product(null, '{"brand": "Rev", "name": "Plum", "price_cents": 30000}') as rv_p \gset
-- A later shelf count of the same product (named on another batch) stops the batch going back on the way.
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 5, "unit_cost_cents": 10000}]}', :'rv_k')::jsonb) as rv_b1 \gset
select public.order_batch(format('{"items": [{"product_id": "%s", "qty": 10, "unit_cost_cents": 10000}]}', :'rv_k')::jsonb) as rv_b2 \gset
select public.arrive_batch(:'rv_b2');
reset role;
-- The count comes a moment after the arrival.
update public.stock_movements set created_at = created_at - interval '1 minute' where batch_id = :'rv_b2';
set role authenticated;
select public.adjust_stock(:'rv_k', 'count', 15, null, null, :'rv_b1');
select pg_temp.expect_error('a later count of its products stops a batch going back on the way',
  format($$select public.undo_batch_arrival('%s')$$, :'rv_b2'), 'counted on the shelf after it arrived');
select pg_temp.check('and the shelf is left as counted', (select on_hand = 15 from public.products where id = :'rv_k'));
-- Undo keeps what changed after the arrival: a product added and a cost fixed.
select public.order_batch(format('{"items": [{"product_id": "%s", "qty": 4, "unit_cost_cents": 10000}]}', :'rv_p')::jsonb) as rv_b3 \gset
select public.arrive_batch(:'rv_b3');
select public.adjust_stock(:'rv_k', 'restock', 2, 12000, null, :'rv_b3');
select public.edit_stock_change((select id from public.stock_movements where batch_id = :'rv_b3' and product_id = :'rv_p'), 4, 11000);
select public.undo_batch_arrival(:'rv_b3');
select pg_temp.check('back on the way, the order is what came: pieces added and costs fixed after it arrived are kept',
  (select count(*) = 2 and sum(qty) = 6 and sum(qty * unit_cost_cents) = 4 * 11000 + 2 * 12000 from public.batch_order_lines where batch_id = :'rv_b3')
  and (select on_hand = 15 from public.products where id = :'rv_k') and (select on_hand = 0 from public.products where id = :'rv_p'));
-- One batch paid ahead doesn't cancel what another still owes.
select public.order_batch(format('{"items": [{"product_id": "%s", "qty": 2, "unit_cost_cents": 50000}], "payment": {"amount_cents": "rest", "source": "company"}}', :'rv_p')::jsonb) as rv_over \gset
select public.arrive_batch(:'rv_over', format('{"items": [{"line_id": "%s", "qty": 1}]}', (select id from public.batch_order_lines where batch_id = :'rv_over'))::jsonb);
select public.finance_report(public.manila_today(), public.manila_today()) -> 'now' as rv_now \gset
reset role;
select pg_temp.check('what is held back for suppliers is each batch''s debt, not netted against a batch paid ahead',
  (:'rv_now'::jsonb ->> 'supplier_reserve')::numeric = (select sum(greatest(0, owed_cents)) from public.batch_money())
  and exists (select 1 from public.batch_money() where batch_id = :'rv_over' and owed_cents = -50000));
set role authenticated;
select public.update_batch_payment((select id from public.batch_payments where batch_id = :'rv_over'),
  format('{"amount_cents": 100000, "source": "owner", "paid_on": "%s", "note": "Fixed"}', public.manila_today() - 1)::jsonb);
select pg_temp.check('a payment on a batch paid ahead can still get its day, whose money and note fixed',
  (select source = 'owner' and paid_on = public.manila_today() - 1 and note = 'Fixed' from public.batch_payments where batch_id = :'rv_over'));
select pg_temp.expect_error('but not go up',
  format($$select public.update_batch_payment('%s', '{"amount_cents": 100001, "source": "owner"}')$$, (select id from public.batch_payments where batch_id = :'rv_over')),
  'is still to pay');
-- Pieces with no cost: paid in full can't be worked out; any amount can be recorded.
select public.order_batch(format('{"items": [{"product_id": "%s", "qty": 3}]}', :'rv_p')::jsonb) as rv_nc \gset
select pg_temp.expect_error('paid in full is refused while a piece has no cost',
  format($$select public.arrive_batch('%s', '{"payment": {"amount_cents": "rest", "source": "company"}}')$$, :'rv_nc'), 'no cost per piece');
select pg_temp.check('and nothing arrived', (select received_on is null from public.stock_batches where id = :'rv_nc'));
select public.add_batch_payment(:'rv_nc', '{"amount_cents": 45000, "source": "company"}');
select pg_temp.check('an amount paid is recorded even though the cost isn''t entered yet',
  (select sum(amount_cents) = 45000 from public.batch_payments where batch_id = :'rv_nc'));
-- An arrival date moved later than the day its pieces were recorded: the books never go below zero in between.
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 2, "unit_cost_cents": 10000}]}', :'rv_p')::jsonb) as rv_late \gset
reset role;
update public.stock_movements set created_at = created_at - interval '3 days' where batch_id = :'rv_late';
update public.batch_payments set paid_on = public.manila_today() - 3 where batch_id = :'rv_late';
update public.stock_batches set received_on = public.manila_today() - 3 where id = :'rv_late';
set role authenticated;
select public.finance_report(public.manila_today() - 3650, public.manila_today() - 2) -> 'end' as rv_before \gset
select public.set_batch_received_on(:'rv_late', public.manila_today());
select public.finance_report(public.manila_today() - 3650, public.manila_today() - 2) -> 'end' as rv_after \gset
select pg_temp.check('moving the arrival date later doesn''t change the books for the days before: the pieces were already there',
  (:'rv_after'::jsonb ->> 'inventory')::numeric = (:'rv_before'::jsonb ->> 'inventory')::numeric
  and (:'rv_after'::jsonb ->> 'owed_suppliers')::numeric = (:'rv_before'::jsonb ->> 'owed_suppliers')::numeric
  and (:'rv_after'::jsonb ->> 'on_the_way')::numeric = (:'rv_before'::jsonb ->> 'on_the_way')::numeric);
-- An order with an expense charged to it isn't removed; then it is, once the expense moves.
select public.order_batch(format('{"items": [{"product_id": "%s", "qty": 1, "unit_cost_cents": 100}]}', :'rv_p')::jsonb) as rv_exp \gset
select public.add_expense(format('{"batch_id": "%s", "category": "other", "amount_cents": 500}', :'rv_exp')::jsonb) as rv_e \gset
select pg_temp.expect_error('an order with an expense charged to it says so', format($$select public.delete_batch_order('%s')$$, :'rv_exp'), 'expenses charged to it');
select public.update_expense(:'rv_e', format('{"category": "other", "amount_cents": 500, "spent_on": "%s", "batch_id": ""}', public.manila_today())::jsonb);
select public.delete_batch_order(:'rv_exp');
select pg_temp.check('once the expense is moved, it is removed', not exists (select 1 from public.stock_batches where id = :'rv_exp'));
-- Deleting a product keeps a batch that has supplier payments; an order left empty goes.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.save_product(null, '{"brand": "Rev", "name": "Gone", "price_cents": 30000}') as rv_g \gset
select public.receive_batch(format('{"items": [{"product_id": "%s", "qty": 1, "unit_cost_cents": 10000}]}', :'rv_g')::jsonb) as rv_gb \gset
select public.order_batch(format('{"items": [{"product_id": "%s", "qty": 1, "unit_cost_cents": 10000}]}', :'rv_g')::jsonb) as rv_go \gset
select public.delete_product(:'rv_g', false);
select pg_temp.check('deleting a test product removes the batch and the order left with nothing, with what was paid for them',
  not exists (select 1 from public.stock_batches where id in (:'rv_gb', :'rv_go'))
  and not exists (select 1 from public.batch_payments where batch_id = :'rv_gb'));
select public.finance_report(public.manila_today() - 3650, public.manila_today()) as rv_fin \gset
select pg_temp.check('finance still adds up, and batch statements still tie to the stock on the shelf',
  ((:'rv_fin'::jsonb -> 'end' ->> 'cash')::numeric + (:'rv_fin'::jsonb -> 'end' ->> 'receivables')::numeric
   + (:'rv_fin'::jsonb -> 'end' ->> 'inventory')::numeric + (:'rv_fin'::jsonb -> 'end' ->> 'on_the_way')::numeric)
  = ((:'rv_fin'::jsonb -> 'end' ->> 'tax_payable')::numeric + (:'rv_fin'::jsonb -> 'end' ->> 'owed_suppliers')::numeric
     + (:'rv_fin'::jsonb -> 'end' ->> 'capital')::numeric + (:'rv_fin'::jsonb -> 'end' ->> 'retained')::numeric)
  and (select abs(sum(stock_cents) - (:'rv_fin'::jsonb -> 'end' ->> 'inventory')::numeric) <= count(*) from public.batch_statements()));
reset role;
select pg_temp.check('stock on the way = what the orders on the way cost; owed = cost − paid, batch by batch',
  (:'rv_fin'::jsonb -> 'end' ->> 'on_the_way')::numeric = (select coalesce(sum(cost_cents), 0) from public.batch_money() where received_on is null)
  and (:'rv_fin'::jsonb -> 'end' ->> 'owed_suppliers')::numeric = (select sum(owed_cents) from public.batch_money()));

select pg_temp.check('no stock is ever in a batch that is on the way',
  not exists (select 1 from public.stock_movements m join public.stock_batches b on b.id = m.batch_id where b.received_on is null));
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect_error('a cost per piece above ₱100,000 is refused',
  format($$select public.order_batch('{"items": [{"product_id": "%s", "qty": 500, "unit_cost_cents": 5000000000}]}')$$, :'rv_p'), 'Cost per piece must be');
select pg_temp.expect_error('each line needs a product',
  $$select public.order_batch('{"items": [{"qty": 2}]}')$$, 'Pick a product for each line');
select public.order_batch(format('{"ordered_on": "%s", "items": [{"product_id": "%s", "qty": 2, "unit_cost_cents": 1000}]}', public.manila_today() - 1, :'rv_p')::jsonb) as rv_ln \gset
select pg_temp.expect_error('Arrived only takes the order''s own lines',
  format($$select public.arrive_batch('%s', '{"items": [{"line_id": "%s", "qty": 1}]}')$$, :'rv_ln', gen_random_uuid()), 'for each product in this order');
-- A payment dated before the order day: the books count the order from the payment, never as money paid ahead.
select public.add_batch_payment(:'rv_ln', format('{"amount_cents": 500, "source": "company", "paid_on": "%s"}', public.manila_today() - 3)::jsonb);
select public.finance_report(public.manila_today() - 3650, public.manila_today() - 3) -> 'end' as rv_early \gset
select pg_temp.check('a payment before the order day counts the order from that day, not as money paid ahead',
  (:'rv_early'::jsonb ->> 'suppliers_ahead')::numeric = 0);
select public.delete_batch_payment((select id from public.batch_payments where batch_id = :'rv_ln'));
select public.delete_batch_order(:'rv_ln');
reset role;
reset role;
select case when ok then 'ok   ' else 'FAIL ' end || name as result from results;
select count(*) filter (where not ok) as failures, count(*) as checks from results;
