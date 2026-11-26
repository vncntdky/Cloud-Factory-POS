-- Batch 3 was entered on 25 Nov 2026 so its cost would show in Finance, before its stock arrived. The owner asked
-- for it to wait as an order on the way (ordered 25 Nov, paid in full from the company fund that day) until someone
-- taps Arrived: its pieces come off the shelf until then. Matches only that batch on the shop's database, so it does
-- nothing anywhere else; batch_back_on_the_way refuses if any of its pieces sold, were counted or are reserved.
select public.batch_back_on_the_way(b.id)
  from public.stock_batches b
 where b.batch_no = 3 and b.received_on = date '2026-11-25' and b.ordered_on is null
   and b.created_at >= timestamptz '2026-11-25 00:00:00+08' and b.created_at < timestamptz '2026-11-26 00:00:00+08';
