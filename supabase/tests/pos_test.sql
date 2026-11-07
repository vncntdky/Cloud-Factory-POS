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
select public.save_product(null, '{"name": "Batch Pod", "price_cents": 10000, "cost_cents": 5000, "opening_qty": 5}') as bp \gset
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
select public.save_product(null, '{"name": "Junk Pod", "price_cents": 100, "opening_qty": 5}') as junk \gset
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
select public.save_product(null, '{"name": "Keep Sales Pod", "price_cents": 100, "opening_qty": 2}') as keep \gset
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

reset role;
select case when ok then 'ok   ' else 'FAIL ' end || name as result from results;
select count(*) filter (where not ok) as failures, count(*) as checks from results;
