#!/usr/bin/env python3
"""Why was the shelf empty? The scorecard's "opportunity cost of an empty shelf", split by cause.

Every number in analysis/empty-shelf-causes.md comes from this script, except the corrections of 27 Nov, which quote
the math check (analysis/empty-shelf-causes-check.py) and say so. This script keeps the consultant's original cause
waterfall; the scorecard's final rules are in the last section of the .md.

Run:  python3 analysis/empty-shelf-causes.py                              (offline, a few seconds; numpy + pandas)
      python3 analysis/empty-shelf-causes.py --now "2026-11-28 09:00:00"  (measure the open stretch to another time)

Data
- Section 1 of analysis/baseline.py (the 26 Nov 2026 18:59 pull). Only that data block is executed.
- Added here (read-only SELECT inside begin ... rollback, 27 Nov 2026 12:04:45 Manila): the entry times, to the
  second, of the records the rules depend on (supplier payments, reserve decisions, the payout, expenses, batch
  dates, and the customer payments that cross a threshold). That check found nothing new since 26 Nov 11:16:44:
  52 sales, 36 payments, 81 stock movements, Batch 3 still on the way, tax rate 0%, no capital entries.
- Inputs from earlier analyses, labelled where used: the engine's shop reorder point (22.6 pieces;
  stock-and-ordering §4.2, re-checked in math-check §4.1) and the 10-11 Nov projection's order window for Batch 3
  (docs/HISTORY.md, "Projection and restock plan").

Method (the cause waterfall)
- The scorecard values each minute with nothing on the shelf at the shop's usual pace while it has stock x landed
  gross profit a piece (2.22 x PHP 159.45 = PHP 354 a day). This script keeps that total and assigns every empty
  minute t to exactly one cause, by asking about the moment tau = t - L (L = the usual delivery time): an order
  placed by tau would, on a usual delivery, have had stock on the shelf at t. First rule that applies wins:
    1 By choice           a dated owner decision covers the minute (shop closed at t; ordering paused at tau)
    2 Waiting for money   on the payment terms used, the company fund could not pay what was due when it was due
                          (at tau if paid at order, while tau is before the payment; at t if paid on pick-up)
    3 Supplier            a dated supplier note says it could not take orders at tau
    4 Not recorded        the batch that ended the gap has no order day, so steps 5 and 6 can't be told apart
    5 Ordered late        at tau the order was not in yet (the money was there and nothing else applied)
    6 Supplier            at tau the order was already in: the delivery took longer than usual
  Steps 5 and 6 never overlap (tau before or after the order), so the parts add up exactly to the total.
  No records exist yet for steps 1 and 3 (0 today).

Privacy: no buyer names. Amounts: centavos in the data, pesos in the output. Times are Manila local time.
Writes analysis/empty-shelf-causes_metrics.json.
"""
import argparse
import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "baseline.py")
_text = open(SRC, encoding="utf-8").read()
_MARK = "# 2. FRAMES"
assert _MARK in _text, "baseline.py layout changed: data block marker not found"
D = {}
exec(compile(_text.split(_MARK)[0], SRC + " [section 1: data only]", "exec"), D)

ap = argparse.ArgumentParser(description="Empty-shelf opportunity cost split by cause")
ap.add_argument("--now", default="2026-11-27 12:04:45", help="Manila time the open stretch is measured to")
ap.add_argument("--no-json", action="store_true", help="don't write the metrics file")
args = ap.parse_args()

NOW = pd.Timestamp(args.now)
LIVE_CHECK = pd.Timestamp("2026-11-27 12:04:45")
DAY = pd.Timedelta(days=1)
SEC = pd.Timedelta(seconds=1)
FAR = pd.Timestamp("2100-01-01")
P = 100.0

# ---------------------------------------------------------------------------------------------
# 0. DATA ADDED HERE (read-only SELECT, 27 Nov 2026 12:04:45 Manila)
# ---------------------------------------------------------------------------------------------
LIVE = dict(checked_at="2026-11-27 12:04:45", sales=52, payments=36, movements=81,
            newest_sale="2026-11-26 11:16:21", newest_payment="2026-11-26 11:16:44",
            newest_movement="2026-11-26 11:16:21", tax_rate_bp=0, capital_entries=0)
# customer payments whose exact second matters (data block has minutes): (minute, centavos) -> entry time(s)
PAY_SECONDS = {
    ("2026-11-06 18:32", 32000): ["2026-11-06 18:32:08"], ("2026-11-06 18:36", 32000): ["2026-11-06 18:36:33"],
    ("2026-11-17 12:45", 34000): ["2026-11-17 12:45:23"], ("2026-11-17 21:14", 40000): ["2026-11-17 21:14:43"],
    ("2026-11-19 08:46", 34000): ["2026-11-19 08:46:02", "2026-11-19 08:46:15"],
    ("2026-11-19 12:11", 34000): ["2026-11-19 12:11:11"], ("2026-11-19 12:39", 68000): ["2026-11-19 12:39:59"],
    ("2026-11-26 11:16", 34000): ["2026-11-26 11:16:44"],
}
# batches: order day, arrival day, when the record was entered
BATCH = {1: dict(ordered_on=None, received_on="2026-10-27", created="2026-11-07 13:25:13"),
         2: dict(ordered_on=None, received_on="2026-11-09", created="2026-11-10 02:04:49"),
         3: dict(ordered_on="2026-11-25", received_on=None, created="2026-11-25 07:34:58")}
# supplier payments: (batch, centavos, paid_on, source, entered). Batches 1 and 2 got theirs from the 26 Nov
# migration ("each existing batch was paid in full on the day it arrived"), so their day is a book convention.
BATCH_PAY = [(1, 503900, "2026-10-27", "owner", "2026-11-07 13:25:13"),
             (2, 519400, "2026-11-09", "company", "2026-11-10 02:04:49"),
             (3, 721400, "2026-11-25", "company", "2026-11-25 07:34:58")]
SET_ASIDE_AT = [("2026-11-10 04:46:58", 0), ("2026-11-13 08:37:44", 719400), ("2026-11-20 02:04:41", 519400),
                ("2026-11-20 02:04:56", 725000), ("2026-11-25 02:04:25", 701400)]
RELEASE_AT = [("2026-11-25 07:48:29", "2026-11-25", 423200)]           # (entered, released_on, centavos)
EXPENSE_AT = [("2026-11-09 17:59:20", "2026-11-09", 64000), ("2026-11-24 01:59:03", "2026-11-24", 10000)]

# inputs from earlier analyses (labelled in the .md)
ROP_ENGINE = 22.6                     # stock-and-ordering §4.2 / math-check §4.1: shop reorder point, pieces
LEAD_GUESS = 7.0                      # the app's starting guess for delivery days (no batch has both dates)
PROJ = dict(order_from="2026-11-12", order_to="2026-11-14", cost=685000)   # docs/HISTORY.md, made 10-11 Nov

# consistency with the data block
assert [(a, c) for a, c in D["SET_ASIDES"]] == [(t[:10], c) for t, c in SET_ASIDE_AT]
assert [(b, c, d, s) for b, c, d, s in D["BATCH_PAYMENTS"]] == \
       [({1: "5e5c3cf4", 2: "f5fec51d", 3: "eea4e791"}[n], c, d, s) for n, c, d, s, _ in BATCH_PAY]
assert [(d, a) for d, a, _, _ in D["RELEASES"]] == [(d, a) for _, d, a in RELEASE_AT]
assert [(d, a) for d, _, a, _ in D["EXPENSES"]] == [(d, a) for _, d, a in EXPENSE_AT]
assert D["SETTINGS"]["tax_rate_bp"] == LIVE["tax_rate_bp"] and D["CAPITAL_CONTRIBUTIONS"] == []

M = {}
def put(name, value, unit, formula):
    v = float(value) if isinstance(value, (np.floating, np.integer, int, float)) and not isinstance(value, bool) else value
    M[name] = dict(value=round(v, 4) if isinstance(v, float) else v, unit=unit, formula=formula,
                   as_of=NOW.strftime("%Y-%m-%d %H:%M"))
    return value
def h(t): print(f"\n=== {t} ===")
def ps(x): return f"₱{x:,.0f}"            # x in pesos
def tm(t): return pd.Timestamp(t).strftime("%a %d %b %H:%M:%S")
def dd(x): return f"{x:.3f} d"

# ---------------------------------------------------------------------------------------------
# 1. FRAMES
# ---------------------------------------------------------------------------------------------
prod = pd.DataFrame([(k, *v) for k, v in D["PRODUCTS"].items()], columns=["pid", "line", "flavour", "price", "cost"])
LINE_BATCH = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
prod["batch"] = prod.line.map(LINE_BATCH)
BID = {v[0]: k for k, v in D["BATCHES"].items()}                      # batch no -> id
NO_OF = {k: v[0] for k, v in D["BATCHES"].items()}                    # id -> batch no

sales = pd.DataFrame(D["SALES"], columns=["sid", "bd", "ts", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales["ts"] = pd.to_datetime(sales.ts); sales["bd"] = pd.to_datetime(sales.bd)
items = pd.DataFrame(D["ITEMS"], columns=["sid", "pid", "q", "up", "uc", "ltot"])
moves = pd.DataFrame(D["MOVES"], columns=["pid", "kind", "delta", "bid", "ts"])
moves["ts"] = pd.to_datetime(moves.ts)
moves = moves.reset_index().rename(columns={"index": "row"})          # data-block order = tie-break (SQL: at, id)
pays = pd.DataFrame(D["PAYMENTS"], columns=["sid", "amt", "bd", "ts"])
pays["ts"] = pd.to_datetime(pays.ts); pays["bd"] = pd.to_datetime(pays.bd)

# a sale's record and its stock movements are written together: take the sale's second from its movement
def sale_second(r):
    pids = items.loc[items.sid == r.sid, "pid"]
    m = moves[(moves.kind == "sale") & moves.pid.isin(pids) & (moves.ts.dt.floor("min") == r.ts)]
    return m.ts.min() if len(m) else pd.NaT
sales["tsec"] = sales.apply(sale_second, axis=1)
assert sales.tsec.notna().all(), "every sale has its stock movement"
_used = {}
def pay_second(r):
    key = (r.ts.strftime("%Y-%m-%d %H:%M"), int(r.amt))
    if key in PAY_SECONDS:
        k = _used.get(key, 0); _used[key] = k + 1
        return pd.Timestamp(PAY_SECONDS[key][k])
    return r.ts
pays["tsec"] = pays.apply(pay_second, axis=1)
done = sales[sales.status == "completed"].copy()
pcs_by_sale = items.groupby("sid").q.sum()
done["pcs"] = done.sid.map(pcs_by_sale)
assert done.pcs.sum() == 60 and done.tot.sum() == D["FIN_END"]["net"]

FIN = D["FIN_END"]
GP_PER_PC = (FIN["net"] - FIN["cogs"]) / P / done.pcs.sum()           # Finance's landed gross profit a piece
FIRST_DAY = min(done.bd.min(), moves.ts.min().normalize())

# ---------------------------------------------------------------------------------------------
# 2. THE SHELF BY THE CLOCK (a replica of ops.v3.sql: lv -> ch -> st -> rg -> tm -> sn -> rate -> sh/cp -> lo)
# ---------------------------------------------------------------------------------------------
mv = moves.sort_values(["pid", "ts", "row"]).copy()
mv["level"] = mv.groupby("pid").delta.cumsum()
mv["on"] = (mv.level > 0).astype(int)
mv["d"] = mv.on - mv.groupby("pid").on.shift(1).fillna(0).astype(int)
CH = mv.groupby("ts").d.sum().sort_index()

def shelf(now):
    st = pd.DataFrame({"s": CH.index, "n": CH.cumsum().values})
    st["e"] = list(st.s.iloc[1:]) + [now]
    return st[st.e > st.s].reset_index(drop=True)

def ov(a, b, lo, hi):
    return max(pd.Timedelta(0), min(b, hi) - max(a, lo)) / DAY

def scorecard(now, period_from=pd.Timestamp("2026-11-01")):
    """The ops dataset's opportunity-cost fields for the month to `now` (period_to = today)."""
    st = shelf(now)
    today = now.normalize()
    rs = max(today - pd.Timedelta(days=89), FIRST_DAY)
    re_ = min(today + DAY, now)
    cs = period_from
    rng = max(1, int(st[(st.s < re_) & (st.e > rs)].n.max()))
    st["full"] = st.n * 10 >= rng * 7
    st["thin"] = (st.n > 0) & (st.n * 10 <= rng * 3)
    st["recent_d"] = [ov(a, b, rs, re_) for a, b in zip(st.s, st.e)]
    st["cur_d"] = [ov(a, b, cs, re_) for a, b in zip(st.s, st.e)]
    sn = done[["tsec", "pcs", "tot"]].copy()
    idx = [st.index[(st.s < t) & (st.e >= t)][0] for t in sn.tsec]
    sn["full"] = st.loc[idx, "full"].values; sn["thin"] = st.loc[idx, "thin"].values
    sn["recent"] = (sn.tsec >= rs) & (sn.tsec < re_); sn["cur"] = (sn.tsec >= cs) & (sn.tsec < re_)
    open_rate = sn.loc[sn.recent, "pcs"].sum() / st.loc[st.n > 0, "recent_d"].sum()
    full_rate = sn.loc[sn.recent & sn.full, "pcs"].sum() / st.loc[st.full, "recent_d"].sum()
    empty_t = st.loc[st.n == 0, "cur_d"].sum()
    short_t = st.loc[~st.full, "cur_d"].sum()
    thin_t = st.loc[st.thin, "cur_d"].sum(); full_t = st.loc[st.full, "cur_d"].sum()
    short_pcs = sn.loc[sn.cur & ~sn.full, "pcs"].sum()
    low = empty_t * open_rate
    high = max(short_t * full_rate - short_pcs, low)
    last = st.iloc[-1]
    since = st.loc[(st.n > 0) & (st.e < now), "e"].max() if last.n == 0 else None
    r = dict(full_shelf=rng, open_rate=open_rate, full_rate=full_rate, empty_t=empty_t, short_t=short_t,
             thin_t=thin_t, full_t=full_t, short_pcs=short_pcs, low_pcs=low, high_pcs=high,
             cost_per_empty_day=open_rate * GP_PER_PC, profit_per_full_day=full_rate * GP_PER_PC,
             lost_profit_low=low * GP_PER_PC, lost_profit_high=high * GP_PER_PC,
             empty_since=since, empty_now_days=(now - since) / DAY if since is not None else 0.0)
    r["empty_now_cost"] = r["empty_now_days"] * r["cost_per_empty_day"]
    return r, st

h("1. The scorecard's opportunity cost, reproduced (ops.v3.sql logic, month to date)")
print(f"live check {LIVE['checked_at']}: {LIVE['sales']} sales, {LIVE['payments']} payments, {LIVE['movements']} "
      f"movements; newest sale {LIVE['newest_sale']}, payment {LIVE['newest_payment']}; tax rate "
      f"{LIVE['tax_rate_bp']} bp; capital entries {LIVE['capital_entries']}")
SC, ST = scorecard(NOW)
SNAP = pd.Timestamp("2026-11-27 10:01:30")      # the reading quoted in the brief (₱1,418 / ₱8,226 / ₱336 now)
SC0, _ = scorecard(SNAP)
assert round(SC0["lost_profit_low"]) == 1418 and round(SC0["lost_profit_high"]) == 8226 and round(SC0["empty_now_cost"]) == 336
print(f"pace with stock {SC['open_rate']:.4f} a day ({done.pcs.sum()} pieces / "
      f"{ST.loc[ST.n > 0, 'recent_d'].sum():.3f} days with stock); full shelf {SC['full_rate']:.4f} a day; "
      f"landed gross profit {GP_PER_PC:.2f} a piece")
print(f"=> {ps(SC['cost_per_empty_day'])} a day with nothing to sell ({SC['cost_per_empty_day']:.2f}); "
      f"{ps(SC['profit_per_full_day'])} a full-shelf day ({SC['profit_per_full_day']:.2f})")
for lab, s in [(f"at {tm(SNAP)} (the brief's reading)", SC0), (f"at {tm(NOW)} (this analysis)", SC)]:
    print(f"November so far {lab}: empty {s['empty_t']:.3f} d, not full {s['short_t']:.3f} d, sold while not full "
          f"{s['short_pcs']} pcs -> low {ps(s['lost_profit_low'])} ({s['lost_profit_low']:.1f}), high "
          f"{ps(s['lost_profit_high'])} ({s['lost_profit_high']:.1f}); empty now {s['empty_now_days']:.3f} d = "
          f"{ps(s['empty_now_cost'])}")
put("cost_per_empty_day", SC["cost_per_empty_day"], "PHP/day", "pace with stock (90 days, by the clock) x landed gross profit a piece")
put("profit_per_full_day", SC["profit_per_full_day"], "PHP/day", "full-shelf pace x landed gross profit a piece")
put("pace_with_stock", SC["open_rate"], "pieces/day", "pieces / days with any flavour on the shelf (ops.v3 open_rate)")
put("pace_full_shelf", SC["full_rate"], "pieces/day", "pieces sold with 7+ of 10 flavours / days with 7+ (ops.v3 full_rate)")
put("gp_per_piece", GP_PER_PC, "PHP/piece", "(finance net - landed cogs) / pieces, 27 Oct-27 Nov")
put("nov_empty_days", SC["empty_t"], "days", "time in November with no flavour on the shelf, to now")
put("nov_lost_profit_low", SC["lost_profit_low"], "PHP", "empty days x pace with stock x gross profit a piece (= lost_profit_low)")
put("nov_lost_profit_high", SC["lost_profit_high"], "PHP", "(not-full days x full pace - pieces sold then) x gross profit (= lost_profit_high)")
put("brief_reading_low_at_1001", SC0["lost_profit_low"], "PHP", "the same at 27 Nov 10:01:30, the reading quoted in the brief")
put("brief_reading_high_at_1001", SC0["lost_profit_high"], "PHP", "the same at 27 Nov 10:01:30")
COST_DAY = SC["cost_per_empty_day"]; FULL_DAY = SC["profit_per_full_day"]
print(f"the low estimate grows {ps(COST_DAY / 24)} an hour ({COST_DAY / 24:.2f}) while the shelf stays empty: "
      f"{ps(SC0['lost_profit_low'])} at 10:01 + {(NOW - SNAP) / DAY:.4f} d x {COST_DAY:.2f} = {SC['lost_profit_low']:.1f}")

# ---------------------------------------------------------------------------------------------
# 3. THE COMPANY FUND, BY THE SECOND (Finance's cash: receipts - company supplier payments - expenses - payouts)
# ---------------------------------------------------------------------------------------------
h("2. The company fund by the second")
def day_end(day): return pd.Timestamp(day) + DAY - SEC
ARRIVAL = {n: moves.loc[moves.bid == BID[n], "ts"].min() if BATCH[n]["received_on"] else None for n in BATCH}
def pay_event(n, day, entered):
    """When a supplier payment left the fund: when entered, but no later than its own day; a payment dated the day
    the batch arrived and entered later counts at the moment the batch came (paid on pick-up)."""
    t = min(pd.Timestamp(entered), day_end(day))
    a = ARRIVAL.get(n)
    if a is not None and pd.Timestamp(day) == a.normalize() and pd.Timestamp(entered) > a:
        t = min(t, a)
    return t
EV = []
for r in done[done.pm != "unpaid"].itertuples():
    EV.append((r.tsec, r.tot, "cash sale"))
for r in pays.itertuples():
    EV.append((r.tsec, r.amt, "collected"))
for n, c, d_, src, ent in BATCH_PAY:
    if src == "company":
        EV.append((pay_event(n, d_, ent), -c, f"Batch {n} paid"))
for ent, d_, c in EXPENSE_AT:
    EV.append((min(pd.Timestamp(ent), day_end(d_)), -c, "expense"))
for ent, d_, c in RELEASE_AT:
    EV.append((min(pd.Timestamp(ent), day_end(d_)), -c, "payout"))
EV.sort(key=lambda x: x[0])
EV_T = np.array([pd.Timestamp(t).value for t, _, _ in EV])
EV_C = np.cumsum([c for _, c, _ in EV])
EVENT_TIMES = sorted(set(pd.Timestamp(t) for t, _, _ in EV))
def cash(x):
    i = np.searchsorted(EV_T, pd.Timestamp(x).value, side="right")
    return float(EV_C[i - 1]) if i > 0 else 0.0

BATCH_COST = {1: 503900, 2: 519400, 3: 721400}
def order_moment(n):
    b = BATCH[n]
    if not b["ordered_on"]:
        return None
    od, c = pd.Timestamp(b["ordered_on"]), pd.Timestamp(b["created"])
    return c if c.normalize() == od else od + pd.Timedelta(hours=12)      # entered later: the middle of its day
def books_ordered_at(n):                       # Finance: the order day, or the arrival when none was recorded
    return order_moment(n) or ARRIVAL[n]
def owed_other(x, exclude):
    """Owed to suppliers at x on batches other than `exclude` (Finance's rule, by the moment)."""
    tot = 0.0
    for n in BATCH:
        if n == exclude or books_ordered_at(n) is None or x < books_ordered_at(n):
            continue
        paid = sum(c for m, c, d_, s, e in BATCH_PAY if m == n and pay_event(m, d_, e) <= x)
        tot += max(0.0, BATCH_COST[n] - paid)
    return tot
TAX_BP = LIVE["tax_rate_bp"]
def tax_payable(x):
    return round(done.loc[done.tsec <= x, "tot"].sum() * TAX_BP / 10000)
def available(x, exclude, extra=None):
    """What the fund could put toward this batch at x: cash - tax payable - owed on other batches (+ a what-if)."""
    v = cash(x) - tax_payable(x) - owed_other(x, exclude)
    return v + (extra(x) if extra else 0.0)

assert round(cash(NOW)) == FIN["cash"]
assert round(cash(pd.Timestamp("2026-11-24 23:59:59"))) == 1144600
assert round(cash(pd.Timestamp("2026-11-25 07:48:28"))) == 423200 and round(cash(pd.Timestamp("2026-11-25 07:48:29"))) == 0
for lab, t in [("end of 31 Oct", "2026-10-31 23:59:59"), ("6 Nov 18:31:43, the shelf empties", "2026-11-06 18:31:43"),
               ("6 Nov 18:32:08", "2026-11-06 18:32:08"), ("9 Nov 19:55:49, just before Batch 2", "2026-11-09 19:55:49"),
               ("13 Nov 08:38, reserve set to ₱7,194", "2026-11-13 08:38:00"), ("19 Nov 11:16:21", "2026-11-19 11:16:21"),
               ("19 Nov 12:11:11", "2026-11-19 12:11:11"), ("end of 24 Nov", "2026-11-24 23:59:59"),
               ("25 Nov 07:34:57, just before Batch 3 paid", "2026-11-25 07:34:57"), ("25 Nov 07:48:29, after the payout", "2026-11-25 07:48:29"),
               (f"{tm(NOW)}, now", NOW)]:
    print(f"  cash at {lab:42s} {ps(cash(pd.Timestamp(t)) / P):>8s}")
print(f"owed to suppliers on other batches and tax payable are ₱0 at every moment tested (tax rate {TAX_BP} bp)")

# ---------------------------------------------------------------------------------------------
# 4. THE CAUSE WATERFALL
# ---------------------------------------------------------------------------------------------
BUCKETS = ["choice", "money", "unrecorded", "late_order", "supplier"]
LABEL = {"choice": "By choice", "money": "Waiting for money", "unrecorded": "Not recorded",
         "late_order": "Ordered late (planning)", "supplier": "Supplier (slower than usual)"}
DECISIONS = []        # (from, to, kind) dated owner decisions: none recorded (the app has no such record yet)
SUPPLIER_NOTES = []   # (from, to) "supplier can't take orders": none recorded

def usual_lead(exclude):
    """Usual delivery days: recorded orders (last 10, other than the batch being judged) blended with the 7-day
    starting guess as one pretend order (stock-and-ordering method 1)."""
    gaps = [(pd.Timestamp(b["received_on"]) - pd.Timestamp(b["ordered_on"])).days
            for n, b in BATCH.items() if n != exclude and b["ordered_on"] and b["received_on"]][-10:]
    return (sum(gaps) + LEAD_GUESS) / (len(gaps) + 1), len(gaps)

def terms(n):
    """Company money due for batch n: the part paid before it came (at order) and the part due on pick-up."""
    a = ARRIVAL.get(n)
    comp = [(c, pay_event(m, d_, e)) for m, c, d_, s, e in BATCH_PAY if m == n and s == "company"]
    ahead = [(c, t) for c, t in comp if a is None or t < a]
    owners = sum(c for m, c, d_, s, e in BATCH_PAY if m == n and s != "company")
    due = BATCH_COST[n] - owners
    ahead_c = sum(c for c, _ in ahead)
    return dict(ahead=ahead_c, ahead_at=min((t for _, t in ahead), default=None), pickup=due - ahead_c, company_due=due,
                label="owner-paid" if due == 0 else ("at order" if ahead_c >= due else ("on pick-up" if ahead_c == 0 else "part")))

def cause_at(m, tau, ctx, money_first=True):
    if any(k == "closed" and a <= m < b for a, b, k in DECISIONS) or any(k != "closed" and a <= tau < b for a, b, k in DECISIONS):
        return "choice"
    av = lambda x: available(x, ctx["batch"], ctx.get("extra"))
    stop = ctx["ahead_at"] or ctx["order"] or FAR
    money = (ctx["ahead"] > 0 and tau < stop and av(tau) < ctx["ahead"]) or (ctx["pickup"] > 0 and av(m) < ctx["pickup"])
    late = (ctx["order"] is None and not ctx["ended"]) or (ctx["order"] is not None and tau < ctx["order"])
    if not money_first and late:
        return "late_order"
    if money:
        return "money"
    if any(a <= tau < b for a, b in SUPPLIER_NOTES):
        return "supplier"
    if ctx["order"] is None and ctx["ended"]:
        return "unrecorded"
    return "late_order" if late else "supplier"

def split(S, E, L, ctx, money_first=True):
    """Exact split of [S, E) by cause: the cause can only change at S, E, order + L, payment + L and the fund's
    events (shifted by L for money due at order), so classify each piece at its midpoint."""
    Ld = pd.Timedelta(days=L)
    bps = {S, E}
    if ctx["order"] is not None: bps.add(ctx["order"] + Ld)
    if ctx["ahead_at"] is not None: bps.add(ctx["ahead_at"] + Ld)
    for t in EVENT_TIMES + ctx.get("extra_times", []):
        if ctx["ahead"] > 0: bps.add(t + Ld)
        if ctx["pickup"] > 0: bps.add(t)
    bps = sorted(x for x in bps if S <= x <= E)
    out = {c: 0.0 for c in BUCKETS}; segs = []
    for a, b in zip(bps[:-1], bps[1:]):
        mid = a + (b - a) / 2
        c = cause_at(mid, mid - Ld, ctx, money_first)
        out[c] += (b - a) / DAY
        if segs and segs[-1][2] == c and segs[-1][1] == a:
            segs[-1] = (segs[-1][0], b, c)
        else:
            segs.append((a, b, c))
    assert abs(sum(out.values()) - (E - S) / DAY) < 1e-9
    return out, segs

def grid_check(S, E, L, ctx, step="1min"):
    """Independent check on a minute grid: classify the middle of every minute."""
    Ld = pd.Timedelta(days=L); stp = pd.Timedelta(step)
    out = {c: 0.0 for c in BUCKETS}
    t = S
    while t < E:
        b = min(t + stp, E); mid = t + (b - t) / 2
        out[cause_at(mid, mid - Ld, ctx)] += (b - t) / DAY
        t = b
    return out

def show(parts, rate=None):
    rate = COST_DAY if rate is None else rate
    return "  ".join(f"{LABEL[c].split(' (')[0]} {v:.3f} d {ps(v * rate)}" for c, v in parts.items() if v > 1e-9)

# the empty stretches (no flavour on the shelf), by the clock
gaps = [(r.s, r.e) for r in ST[ST.n == 0].itertuples()]
assert len(gaps) == 2
(S1, A1), (S2, E2) = gaps
assert E2 == NOW and moves.loc[moves.ts == A1, "bid"].iloc[0] == BID[2]
L0, nrec = usual_lead(exclude=3)
O3 = order_moment(3)
T2, T3 = terms(2), terms(3)
h("3. The two empty stretches and what the records say about each")
print(f"usual delivery time: {L0:.1f} days ({nrec} recorded orders with both dates; the 7-day starting guess)")
print(f"stretch 1: {tm(S1)} -> {tm(A1)} = {(A1 - S1) / DAY:.4f} d, ended by Batch 2 (order day not recorded); "
      f"company money due {ps(T2['company_due'] / P)}, terms in the records: {T2['label']}")
print(f"stretch 2: {tm(S2)} -> now {tm(NOW)} = {(NOW - S2) / DAY:.4f} d so far; Batch 3 ordered {tm(O3)} "
      f"({(S2 - O3) / DAY:.2f} d before the shelf emptied), terms: {T3['label']} ({ps(T3['ahead'] / P)} at {tm(T3['ahead_at'])})")
put("stretch1_days", (A1 - S1) / DAY, "days", "6 Nov 18:31:43 (last Batch 1 piece) -> 9 Nov 19:55:50 (first Batch 2 restock)")
put("stretch2_days_so_far", (NOW - S2) / DAY, "days", "26 Nov 11:16:21 (last Batch 2 piece) -> now")
put("usual_delivery_days", L0, "days", "(sum of recorded order->arrival days + 7) / (orders + 1); 0 recorded -> 7")

CTX = {
    1: dict(batch=2, order=None, ended=True, ahead=T2["ahead"], ahead_at=T2["ahead_at"], pickup=T2["pickup"]),
    2: dict(batch=3, order=O3, ended=False, ahead=T3["ahead"], ahead_at=T3["ahead_at"], pickup=T3["pickup"]),
}
# what-if contexts for the payment-terms test
B3_PAID = T3["ahead_at"]
CTX_WHATIF = {
    (1, "at order"): dict(batch=2, order=None, ended=True, ahead=T2["company_due"], ahead_at=None, pickup=0),
    (1, "on pick-up"): CTX[1],
    (2, "at order"): CTX[2],
    # Batch 3 on pick-up: the 7,214 stays in the fund (Finance would have held it back as owed to suppliers, so the
    # 25 Nov payout is still allowed: see section 5); the money is then due when it comes
    (2, "on pick-up"): dict(batch=3, order=O3, ended=False, ahead=0, ahead_at=None, pickup=T3["company_due"],
                            extra=lambda x: T3["company_due"] if x >= B3_PAID else 0.0),
}

h("4. Stretch 1, 6-9 Nov (Batch 2 has no order day)")
p1, seg1 = split(S1, A1, L0, CTX[1])
g1 = grid_check(S1, A1, L0, CTX[1], "10s")
assert all(abs(p1[c] - g1[c]) < 4 * 10 / 86400 for c in BUCKETS)
for a, b, c in seg1:
    print(f"  {tm(a)} -> {tm(b)}  {(b - a) / DAY:8.5f} d  {LABEL[c]}")
print(f"  split: {show(p1)}")
first_enough_b2 = next(pd.Timestamp(t) for t in EVENT_TIMES if t >= S1 and available(pd.Timestamp(t), 2) >= T2["company_due"])
stays = all(available(pd.Timestamp(t), 2) >= T2["company_due"] for t in EVENT_TIMES if first_enough_b2 <= t < A1)
print(f"  the fund had {ps(cash(S1) / P)} when the shelf emptied, short {ps((T2['company_due'] - cash(S1)) / P)} of the "
      f"{ps(T2['company_due'] / P)} bill; it had the bill from {tm(first_enough_b2)} "
      f"({(first_enough_b2 - S1).total_seconds():.0f} s later) and kept it until Batch 2 came: {stays}")
put("stretch1_money_seconds", (first_enough_b2 - S1).total_seconds(), "seconds", "fund below Batch 2's 5,194 after the shelf emptied")
put("stretch1_unrecorded_days", p1["unrecorded"], "days", "rest of stretch 1: no order day, so late order vs slow delivery can't be told apart")
put("stretch1_unrecorded_cost", p1["unrecorded"] * COST_DAY, "PHP", "x cost per empty day")
put("stretch1_total_cost", (A1 - S1) / DAY * COST_DAY, "PHP", "stretch 1 days x cost per empty day")
print("  what each delivery time implies (latest on-time day = sell-out - L; implied order = arrival - L):")
tot_stock = moves.sort_values(["ts", "row"]).set_index("ts").delta.cumsum()
def stock_at(t):
    s = tot_stock[tot_stock.index <= t]
    return int(s.iloc[-1]) if len(s) else 0
S1_rows = []
for L in (5, 7, 10):
    Ld = pd.Timedelta(days=L)
    lot, imp = S1 - Ld, A1 - Ld
    row = dict(L=L, latest_on_time=lot, cash_then=cash(lot) / P, cash_share=cash(lot) / T2["company_due"],
               implied_order=imp, pieces_left=stock_at(imp), late_if_usual=(imp - lot) / DAY)
    S1_rows.append(row)
    print(f"   L {L:2d}: latest on-time day {tm(lot)}, fund then {ps(row['cash_then'])} ({row['cash_share']:.0%} of the "
          f"bill); if delivery took {L} d the order went in {tm(imp)} with {row['pieces_left']} pieces left, "
          f"{row['late_if_usual']:.2f} d late; if it went in on time, delivery took {(A1 - S1) / DAY:.2f} d longer than usual")
    put(f"stretch1_cash_on_latest_on_time_day_L{L}", row["cash_then"], "PHP", f"company cash at 6 Nov 18:31:43 - {L} days")
    put(f"stretch1_pieces_left_at_implied_order_L{L}", row["pieces_left"], "pieces", f"shop stock at 9 Nov 19:55:50 - {L} days")
# could the books' "paid on arrival" be wrong? if paid at order, the fund had to hold 5,194 L days before arrival
print("  if Batch 2 had been paid at order, the fund needed the bill by arrival - L:")
for L in (5, 7, 10):
    t = A1 - pd.Timedelta(days=L)
    print(f"   L {L:2d}: {tm(t)} fund {ps(cash(t) / P)} = {cash(t) / T2['company_due']:.0%} of {ps(T2['company_due'] / P)}"
          f" -> only possible if delivery took <= {(A1 - first_enough_b2) / DAY:.2f} d")
put("stretch1_max_delivery_if_paid_at_order", (A1 - first_enough_b2) / DAY, "days",
    "the fund first held 5,194 at 6 Nov 18:32:08; Batch 2 came 9 Nov 19:55:50")

h("5. Stretch 2, from 26 Nov 11:16 (Batch 3 ordered 25 Nov, paid at order)")
A3_exp = O3 + pd.Timedelta(days=L0)
p2_now, seg2_now = split(S2, NOW, L0, CTX[2])
p2_exp, seg2_exp = split(S2, A3_exp, L0, CTX[2])
g2 = grid_check(S2, A3_exp, L0, CTX[2])
assert all(abs(p2_exp[c] - g2[c]) < 4 / 1440 for c in BUCKETS)
lot2 = S2 - pd.Timedelta(days=L0)
first_enough_b3 = next(pd.Timestamp(t) for t in EVENT_TIMES if t >= lot2 and available(pd.Timestamp(t), 3) >= T3["ahead"])
stays3 = all(available(pd.Timestamp(t), 3) >= T3["ahead"] for t in EVENT_TIMES if first_enough_b3 <= t < O3)
print(f"latest on-time day (sell-out - {L0:.0f} d): {tm(lot2)}; fund then {ps(cash(lot2) / P)}, short "
      f"{ps((T3['ahead'] - cash(lot2)) / P)} of {ps(T3['ahead'] / P)}; enough from {tm(first_enough_b3)} and kept it until "
      f"the order: {stays3}; order {tm(O3)} = {(O3 - first_enough_b3) / DAY:.4f} d after the money was there")
print(f"expected arrival (order + {L0:.0f} d, starting guess): {tm(A3_exp)}; empty {(A3_exp - S2) / DAY:.4f} d by then")
for a, b, c in seg2_exp:
    print(f"  {tm(a)} -> {tm(b)}  {(b - a) / DAY:8.5f} d  {LABEL[c]}")
print(f"  so far ({tm(NOW)}): {show(p2_now)}   total {ps((NOW - S2) / DAY * COST_DAY)}")
print(f"  by expected arrival:   {show(p2_exp)}   total {ps((A3_exp - S2) / DAY * COST_DAY)}")
nov_end = pd.Timestamp("2026-12-01")
p2_nov, _ = split(S2, min(nov_end, A3_exp), L0, CTX[2])
print(f"  within November (to 30 Nov 24:00, if it comes as expected): {show(p2_nov)}")
for k, v in p2_now.items():
    put(f"stretch2_so_far_{k}_days", v, "days", f"{LABEL[k]}: empty minutes so far by the waterfall (L {L0:.0f})")
for k, v in p2_exp.items():
    put(f"stretch2_to_arrival_{k}_days", v, "days", f"{LABEL[k]}: to the expected arrival {A3_exp:%d %b %H:%M}")
put("stretch2_so_far_cost", (NOW - S2) / DAY * COST_DAY, "PHP", "days so far x cost per empty day")
put("stretch2_so_far_late_order_cost", p2_now["late_order"] * COST_DAY, "PHP", "ordered-late days so far x cost per empty day")
put("stretch2_so_far_money_cost", p2_now["money"] * COST_DAY, "PHP", "waiting-for-money days so far x cost per empty day")
put("stretch2_to_arrival_cost", (A3_exp - S2) / DAY * COST_DAY, "PHP", "days to the expected arrival x cost per empty day")
put("stretch2_to_arrival_late_order_cost", p2_exp["late_order"] * COST_DAY, "PHP", "ordered late, to the expected arrival")
put("stretch2_to_arrival_money_cost", p2_exp["money"] * COST_DAY, "PHP", "waiting for money, to the expected arrival")
put("batch3_latest_on_time", lot2.strftime("%Y-%m-%d %H:%M:%S"), "time", "26 Nov 11:16:21 - 7 days")
put("batch3_money_enough_at", first_enough_b3.strftime("%Y-%m-%d %H:%M:%S"), "time", "first moment the fund held 7,214 (and kept it)")
put("batch3_order_days_after_money", (O3 - first_enough_b3) / DAY, "days", "order 25 Nov 07:34:58 - 19 Nov 12:11:11")

h("6. Sensitivity: delivery time 5 / 7 / 10 days x payment at order or on pick-up")
SENS = []
for which, (S, Eact) in [(1, (S1, A1)), (2, (S2, None))]:
    for L in (5, 7, 10):
        for tr in ("at order", "on pick-up"):
            ctx = CTX_WHATIF[(which, tr)]
            rec = (which == 1 and tr == "on pick-up") or (which == 2 and tr == "at order")
            if which == 1:
                pa, _ = split(S, Eact, L, ctx); pn = None
                end = Eact
            else:
                end = O3 + pd.Timedelta(days=L)
                pn, _ = split(S, min(NOW, end), L, ctx); pa, _ = split(S, end, L, ctx)
            SENS.append(dict(stretch=which, L=L, terms=tr, recorded=rec, end=end, total=(end - S) / DAY, parts=pa, so_far=pn))
            tag = " (as recorded)" if rec else " (what-if)"
            print(f"stretch {which}  L {L:2d}  {tr:10s}{tag:15s} to {'arrival' if which == 1 else 'expected arrival'} "
                  f"{tm(end)}: {(end - S) / DAY:.3f} d {ps((end - S) / DAY * COST_DAY)} | {show(pa)}")
            if pn is not None:
                print(f"{'':52s} so far: {show(pn)}")
            key = f"s{which}_L{L}_{tr.replace(' ', '_').replace('-', '')}"
            for k, v in pa.items():
                put(f"sens_{key}_{k}_days", v, "days", f"stretch {which}, delivery {L} d, paid {tr}: {LABEL[k]}")
# the order of the waterfall: planning tested before money
for L in (7, 10):
    pm, _ = split(S2, O3 + pd.Timedelta(days=L), L, CTX[2], money_first=True)
    pp, _ = split(S2, O3 + pd.Timedelta(days=L), L, CTX[2], money_first=False)
    print(f"order test, stretch 2, L {L}: money first -> {show(pm)} | planning first -> {show(pp)}")
    put(f"order_test_L{L}_money_days_money_first", pm["money"], "days", "waterfall as stated (money before ordered late)")
    put(f"order_test_L{L}_money_days_planning_first", pp["money"], "days", "if ordered late were tested before money")
# where the planning part stops depending on L: the order went in O3 - first_enough_b3 after the money was there
L_break = (S2 - first_enough_b3) / DAY
print(f"the ordered-late part is {(O3 - first_enough_b3) / DAY:.3f} d for any delivery time of {L_break:.2f} d or more; "
      f"below that it is L - {(S2 - O3) / DAY:.2f} d")
put("stretch2_late_order_days_floor", (O3 - first_enough_b3) / DAY, "days", "ordered-late days for any delivery time >= 6.96 d")

# ---------------------------------------------------------------------------------------------
# 5. WHY THE MONEY WAS SHORT (pesos), AND THE PAYOUT CHECK FOR THE PICK-UP WHAT-IF
# ---------------------------------------------------------------------------------------------
h("7. Waiting for money: why the fund was short (payouts | money owed by buyers | not earned yet)")
credit = done[done.pm == "unpaid"]
def receivables(x):
    return credit.loc[credit.tsec <= x, "tot"].sum() - pays.loc[pays.tsec <= x, "amt"].sum()
def payouts_since_last_order(x, n):
    prev = [pay_event(m, d_, e) for m, c, d_, s, e in BATCH_PAY if s == "company" and m != n and pay_event(m, d_, e) <= x]
    since = max(prev) if prev else pd.Timestamp("1900-01-01")
    return sum(c for ent, d_, c in RELEASE_AT if since < min(pd.Timestamp(ent), day_end(d_)) <= x)
WHY = []
for lab, L, (S, E), ctx in [("stretch 1, L 7", L0, (S1, A1), CTX[1]), ("stretch 2, L 7", L0, (S2, A3_exp), CTX[2]),
                            ("stretch 2, L 10", 10, (S2, O3 + pd.Timedelta(days=10)), CTX[2])]:
    _, segs = split(S, E, L, ctx)
    for a, b, c in segs:
        if c != "money":
            continue
        when = a - pd.Timedelta(days=L) if ctx["ahead"] > 0 else a         # the moment the money was due
        due = ctx["ahead"] if ctx["ahead"] > 0 else ctx["pickup"]
        av, po, rc = available(when, ctx["batch"]), payouts_since_last_order(when, ctx["batch"]), receivables(when)
        why = "payouts" if av + po >= due else ("money owed by buyers" if av + po + rc >= due else "not earned yet")
        WHY.append(dict(case=lab, a=a, b=b, days=(b - a) / DAY, due_at=when, shortfall=(due - av) / P,
                        payouts=po / P, receivables=rc / P, why=why))
        print(f"  {lab}: empty {tm(a)} -> {tm(b)} ({(b - a) / DAY:.4f} d); money due at {tm(when)}: short "
              f"{ps((due - av) / P)}, payouts since the last order {ps(po / P)}, owed by buyers {ps(rc / P)} -> {why}")
put("money_short_b3_at_latest_on_time", next(w["shortfall"] for w in WHY if w["case"] == "stretch 2, L 7"), "PHP",
    "7,214 - fund at 19 Nov 11:16:21")
put("receivables_b3_at_latest_on_time", next(w["receivables"] for w in WHY if w["case"] == "stretch 2, L 7"), "PHP",
    "credit sales - collections at 19 Nov 11:16:21")
# what-if: Batch 3 on pick-up. Finance would have held the unpaid order back as owed to suppliers; was the payout
# still allowed, and would the fund have had the money on the pick-up day?
FEES = {n: sum(D["BATCHES"][BID[n]][3:]) for n in (1, 2, 3)}
LANDED = {pid: c + FEES[b] / 30 for pid, c, b in zip(prod.pid, prod.cost, prod.batch) if b in (1, 2)}
def profit_kept(x):
    s = done[done.tsec <= x]
    cogs = items[items.sid.isin(s.sid)].pipe(lambda d: (d.q * d.pid.map(LANDED)).sum())
    ex = sum(c for ent, d_, c in EXPENSE_AT if min(pd.Timestamp(ent), day_end(d_)) <= x)
    rel = sum(c for ent, d_, c in RELEASE_AT if min(pd.Timestamp(ent), day_end(d_)) <= x)
    return s.tot.sum() - cogs - ex - rel - tax_payable(x)
t0748 = pd.Timestamp("2026-11-25 07:48:28")
cash_0748_cf = cash(t0748) + T3["company_due"]
spare_0748_cf = cash_0748_cf - T3["company_due"]   # Finance holds the unpaid order back; the order uses up the reserve
safe_0748_cf = max(0.0, min(profit_kept(t0748), spare_0748_cf))
assert round(profit_kept(t0748) / P) == 8660 and safe_0748_cf >= 423200
print(f"pick-up what-if: at 25 Nov 07:48 the fund would hold {ps(cash_0748_cf / P)}; Finance holds the unpaid "
      f"{ps(T3['company_due'] / P)} back as owed to suppliers and the order uses up the reserve -> spare "
      f"{ps(spare_0748_cf / P)}, profit kept {ps(profit_kept(t0748) / P)}, safe to distribute {ps(safe_0748_cf / P)}: "
      f"the {ps(423200 / P)} payout still fits; on the expected pick-up day the fund would hold "
      f"{ps((cash(NOW) + T3['company_due']) / P)} against {ps(T3['company_due'] / P)}")
put("pickup_whatif_safe_0748", safe_0748_cf / P, "PHP", "min(profit kept, cash - owed on Batch 3) at 25 Nov 07:48 had Batch 3 been unpaid")

# ---------------------------------------------------------------------------------------------
# 6. THE ORDER-BY DATES: lenient (for pesos) against the plan's (for the process)
# ---------------------------------------------------------------------------------------------
h("8. Which 'should have ordered by' date: lenient latest on-time day vs the plan's order-by date")
def engine_date(after, rop=ROP_ENGINE):
    s = tot_stock[tot_stock.index > after]
    return s[s < rop].index.min()
B1_full = moves.loc[moves.bid == BID[1], "ts"].max(); B2_full = moves.loc[moves.bid == BID[2], "ts"].max()
eng_b2, eng_b3 = engine_date(B1_full), engine_date(B2_full)
print(f"engine's reorder point {ROP_ENGINE} pieces applied after each batch was on the shelf (today's settings, hindsight):")
print(f"  order for Batch 2 by {tm(eng_b2)} ({30 - stock_at(eng_b2)} of Batch 1's 30 sold); lenient date {tm(S1 - pd.Timedelta(days=L0))}")
print(f"  order for Batch 3 by {tm(eng_b3)} ({30 - stock_at(eng_b3)} of Batch 2's 30 sold); lenient date {tm(lot2)}; actual {tm(O3)}")
pf, pt_ = pd.Timestamp(PROJ["order_from"]), pd.Timestamp(PROJ["order_to"]) + DAY - SEC
first_proj = next(pd.Timestamp(t) for t in EVENT_TIMES if t >= pf and cash(pd.Timestamp(t)) >= PROJ["cost"])
print(f"  10-11 Nov projection: order Batch 3 on 12-14 Nov for about {ps(PROJ['cost'] / P)}; the fund held "
      f"{ps(cash(pf) / P)} at the start of 12 Nov and {ps(cash(pt_) / P)} at the end of 14 Nov, "
      f"{ps(PROJ['cost'] / P)} first at {tm(first_proj)}")
for key, lab, t in [("engine_rop", "engine reorder point (today's settings)", eng_b3),
                     ("projection_from", "10-11 Nov projection, from", pf),
                     ("projection_to", "10-11 Nov projection, to", pd.Timestamp(PROJ["order_to"]) + DAY),
                     ("latest_on_time", "lenient latest on-time day", lot2),
                     ("money_enough", "money first enough at order", first_enough_b3)]:
    print(f"  Batch 3 ordered {(O3 - t) / DAY:6.2f} d after the {lab} ({tm(t)}); fund then {ps(cash(t) / P)}")
    put(f"b3_days_late_vs_{key}", (O3 - t) / DAY, "days", f"order 25 Nov 07:34:58 - {lab} {t:%d %b %H:%M}")
    put(f"b3_fund_at_{key}", cash(t) / P, "PHP", f"company cash at the {lab}")
put("b3_projection_cost_first_affordable", first_proj.strftime("%Y-%m-%d %H:%M:%S"), "time",
    "first moment the fund held the projection's 6,850")
print(f"  the fund first held the projection's {ps(PROJ['cost'] / P)} at {tm(first_proj)} (fund {ps(cash(first_proj) / P)}), "
      f"{(O3 - first_proj) / DAY:.2f} d before the order; shop stock when Batch 3 was ordered: {stock_at(O3)} piece(s)")
put("b3_days_late_vs_projection_cost_affordable", (O3 - first_proj) / DAY, "days", "order - first moment the fund held 6,850")
put("stock_when_b3_ordered", stock_at(O3), "pieces", "shop stock at 25 Nov 07:34:58")
# on pick-up terms the projection's date would have been affordable: money needed on its arrival (order + 7)
for d_ in ("2026-11-12", "2026-11-13", "2026-11-14"):
    arr = pd.Timestamp(d_) + pd.Timedelta(hours=12) + pd.Timedelta(days=L0)
    print(f"  ordered {d_} noon on pick-up terms -> due {tm(arr)}: fund {ps(cash(arr) / P)} vs {ps(T3['company_due'] / P)}")

# ---------------------------------------------------------------------------------------------
# 7. NOVEMBER ROLL-UP (what the scorecard would show)
# ---------------------------------------------------------------------------------------------
h("9. November so far, split (the scorecard's low estimate) and the plan's range")
nov = {c: p1[c] + p2_now[c] for c in BUCKETS}
assert abs(sum(nov.values()) - SC["empty_t"]) < 1e-9
for c in BUCKETS:
    print(f"  {LABEL[c]:30s} {nov[c]:8.4f} d  {ps(nov[c] * COST_DAY):>8s}  ({nov[c] * COST_DAY:9.2f})  {nov[c] / SC['empty_t']:6.1%}")
    put(f"nov_{c}_days", nov[c], "days", f"{LABEL[c]}: November empty time by the waterfall")
    put(f"nov_{c}_cost", nov[c] * COST_DAY, "PHP", f"{LABEL[c]}: days x cost per empty day")
print(f"  {'Total (= lost_profit_low)':30s} {SC['empty_t']:8.4f} d  {ps(SC['lost_profit_low']):>8s}")
plan_lo, plan_hi = nov["late_order"] * COST_DAY, (nov["late_order"] + nov["unrecorded"]) * COST_DAY
known = 1 - nov["unrecorded"] / SC["empty_t"]
print(f"  judge the plan on: ordered late {ps(plan_lo)} (at least) to {ps(plan_hi)} (with the not-recorded days)")
print(f"  share of empty time with a known cause: {known:.1%}")
put("nov_plan_lost_profit_low", plan_lo, "PHP", "ordered late only")
put("nov_plan_lost_profit_high", plan_hi, "PHP", "ordered late + not recorded")
put("nov_known_cause_share", known, "share", "1 - not recorded / empty time")
# the empty part of the high estimate at the full-shelf rate, and the rest (partly stocked)
high_empty = SC["empty_t"] * FULL_DAY
thin_part = SC["lost_profit_high"] - high_empty
print(f"  high estimate {ps(SC['lost_profit_high'])} = nothing on the shelf at the full-shelf rate {ps(high_empty)} "
      f"({SC['empty_t']:.3f} d x {FULL_DAY:.2f}) + shelf partly stocked {ps(thin_part)}")
for c in BUCKETS:
    if nov[c] > 1e-9:
        print(f"    {LABEL[c]:30s} at the full-shelf rate {ps(nov[c] * FULL_DAY)}")
put("nov_high_empty_part", high_empty, "PHP", "empty days x full-shelf pace x gross profit a piece")
put("nov_high_thin_part", thin_part, "PHP", "lost_profit_high - the empty part")
nov_full = {c: p1[c] + p2_nov[c] for c in BUCKETS}
tot_full = sum(nov_full.values())
print(f"  November to 30 Nov 24:00 if Batch 3 comes as expected: {tot_full:.3f} d {ps(tot_full * COST_DAY)} | {show(nov_full)}")
put("nov_to_month_end_cost", tot_full * COST_DAY, "PHP", "November empty time to 30 Nov 24:00 (Batch 3 due 2 Dec) x cost per day")
put("nov_to_month_end_late_order_cost", nov_full["late_order"] * COST_DAY, "PHP", "the ordered-late part of it")
only_plan_share = nov["late_order"] / SC["empty_t"]
print(f"  a planning-only figure would show {ps(nov['late_order'] * COST_DAY)} of {ps(SC['lost_profit_low'])} "
      f"({only_plan_share:.0%}) this month")
put("nov_planning_only_share", only_plan_share, "share", "ordered-late part / all empty time, November so far")

# ---------------------------------------------------------------------------------------------
# 8. THIN SHELF (the high estimate): flavour gaps, waiting for the next batch vs not reordered by choice
# ---------------------------------------------------------------------------------------------
h("10. Thin shelf: why flavours were missing while the shop still had stock")
st = ST.copy()
rng_ = SC["full_shelf"]
st["full"] = st.n * 10 >= rng_ * 7
nov0 = pd.Timestamp("2026-11-01")
sn = done[["tsec", "pcs"]].copy()
sn["full"] = [bool(st.loc[(st.s < t) & (st.e >= t), "full"].iloc[0]) for t in sn.tsec]
def partly(lo, hi):
    t = sum(ov(a, b, lo, hi) for a, b, n, f in zip(st.s, st.e, st.n, st.full) if n > 0 and not f)
    pcs = sn.loc[(sn.tsec > lo) & (sn.tsec <= hi) & ~sn.full, "pcs"].sum()   # a sale belongs to the stretch it ends
    return t, pcs, (t * SC["full_rate"] - pcs) * GP_PER_PC
w1 = partly(nov0, S1); w2 = partly(A1, S2)
assert abs(w1[2] + w2[2] - thin_part) < 1e-6
for lab, w in [("Batch 1's tail, 1-6 Nov", w1), ("Batch 2, 9-26 Nov", w2)]:
    print(f"  {lab:24s}: shelf partly stocked (1-6 of 10) {w[0]:.3f} d, {w[1]} pieces sold then, "
          f"full-shelf pace would sell {w[0] * SC['full_rate']:.1f} -> {ps(w[2])}")
put("thin_b1_tail_cost", w1[2], "PHP", "(partly stocked days x full pace - pieces sold) x gross profit, 1-6 Nov")
put("thin_b2_cost", w2[2], "PHP", "same, 9-26 Nov")
# each flavour's gap: from its sell-out to the moment the whole shop emptied (after that it is in the empty part)
gap_rows = []
for pid, g in mv.groupby("pid"):
    offs = g[(g.d == -1)]
    if not len(offs):
        continue
    out_at = offs.ts.iloc[0]
    b = int(prod.loc[prod.pid == pid, "batch"].iloc[0])
    shop_out = S1 if b == 1 else S2
    back = g[(g.d == 1) & (g.ts > out_at)]
    reordered = bool(((g.kind == "restock") & (g.ts > out_at)).any())
    gap_rows.append(dict(batch=b, flavour=prod.loc[prod.pid == pid, "flavour"].iloc[0], out=out_at,
                         gap_days=max(0.0, (shop_out - out_at) / DAY), reordered=reordered,
                         back_25s=bool(len(back))))
gp_ = pd.DataFrame(gap_rows)
for b in (1, 2):
    x = gp_[gp_.batch == b]
    print(f"  Batch {b}: {len(x)} flavours sold out; {x.gap_days.sum():.2f} flavour-days missing while the shop had stock; "
          f"reordered {int(x.reordered.sum())}; slots refilled by the next batch's new flavours: "
          f"{'10 (Black TEO, 9 Nov 19:55)' if b == 1 else 'waiting for Batch 3 (10 BLXCK Signature + 1 device)'}")
put("flavours_reordered", int(gp_.reordered.sum()), "flavours", "flavours restocked after selling out (none: every batch was a new line)")
put("thin_by_choice_cost", 0.0, "PHP", "no flavour slot was left empty past the next arrival; no range decision recorded")
put("thin_wait_next_batch_cost", thin_part, "PHP", "all of the partly-stocked part")
print(f"  split of the partly-stocked part {ps(thin_part)}: waiting for the next batch {ps(thin_part)} (100%), "
      f"not reordered by choice {ps(0)} (0%): every arrival put 10 flavours back, so the count recovered whichever line came")
print(f"  (the Blue Freeze void on 25 Nov puts it back on the shelf for 25 s; the scorecard counts it, as here)")

# ---------------------------------------------------------------------------------------------
# 9. SUMMARY FOR THE STRUCTURED OUTPUT
# ---------------------------------------------------------------------------------------------
h("11. Summary")
summ = dict(
    as_of=NOW.strftime("%Y-%m-%d %H:%M:%S"), cost_per_empty_day=COST_DAY, profit_per_full_day=FULL_DAY,
    stretch1=dict(start=S1, end=A1, days=(A1 - S1) / DAY, parts=p1, pesos=(A1 - S1) / DAY * COST_DAY),
    stretch2_so_far=dict(start=S2, end=NOW, days=(NOW - S2) / DAY, parts=p2_now, pesos=(NOW - S2) / DAY * COST_DAY),
    stretch2_to_arrival=dict(start=S2, end=A3_exp, days=(A3_exp - S2) / DAY, parts=p2_exp, pesos=(A3_exp - S2) / DAY * COST_DAY),
    november=dict(days=SC["empty_t"], parts=nov, low=SC["lost_profit_low"], high=SC["lost_profit_high"],
                  plan_low=plan_lo, plan_high=plan_hi, known=known, high_empty=high_empty, thin=thin_part))
for k in ("stretch1", "stretch2_so_far", "stretch2_to_arrival"):
    s = summ[k]
    print(f"{k:20s} {tm(s['start'])} -> {tm(s['end'])}: {s['days']:.4f} d {ps(s['pesos'])} | {show(s['parts'])}")

def lr_round(parts_pesos):
    """Whole pesos that add up to the rounded total (largest remainder), as the scorecard should show them."""
    total = round(sum(parts_pesos.values()))
    fl = {k: float(np.floor(v)) for k, v in parts_pesos.items()}
    extra = int(total - sum(fl.values()))
    for k in sorted(parts_pesos, key=lambda k: parts_pesos[k] - fl[k], reverse=True)[:extra]:
        fl[k] += 1
    return total, fl
# (The scorecard's final rules, last section of the .md, round each figure on its own instead; this printout keeps the
# consultant's largest-remainder figures.)
print("whole pesos as the scorecard should show them (largest remainder, so the parts add up to the total):")
# Each sensitivity row has its own key: stretch, delivery days (L) and payment terms, e.g.
# shown_sensitivity_stretch_2_L7_at_order_late_order. Fixed 27 Nov (math check): the 12 rows used to share 10 names,
# shown_sensitivity_stretch_<n>_<cause>, so only each stretch's last row (L 10, on pick-up) survived in the JSON.
sens_rows = [(f"sensitivity: stretch {r['stretch']}, L {r['L']}, {r['terms']}{' (recorded)' if r['recorded'] else ''}", r["parts"],
              f"sensitivity_stretch_{r['stretch']}_L{r['L']}_{r['terms'].replace(' ', '_').replace('-', '')}")
             for r in SENS]
base_rows = [(lab, parts, lab.split(",")[0].replace(" ", "_").replace(":", "").replace("-", "_").lower())
             for lab, parts in [("November so far", nov), ("stretch 1, 6-9 Nov", p1), ("stretch 2 so far", p2_now),
                                ("stretch 2 to expected arrival", p2_exp), ("November to 30 Nov 24:00", nov_full)]]
for lab, parts, key in base_rows + sens_rows:
    total, r = lr_round({c: v * COST_DAY for c, v in parts.items()})
    print(f"  {lab:30s} {ps(total):>8s} = " + " + ".join(f"{LABEL[c].split(' (')[0]} {ps(v)}" for c, v in r.items() if v))
    for c, v in r.items():
        put(f"shown_{key}_{c}", v, "PHP", f"{lab}: {LABEL[c]}, whole pesos by largest remainder (adds up to {total:,.0f})")
assert len([k for k in M if k.startswith("shown_sensitivity_")]) == len(SENS) * len(BUCKETS), "one key per row and cause"
print(f"november            {SC['empty_t']:.4f} d low {ps(SC['lost_profit_low'])} high {ps(SC['lost_profit_high'])} | plan "
      f"{ps(plan_lo)}-{ps(plan_hi)} | known cause {known:.0%}")

if not args.no_json:
    out = os.path.join(HERE, "empty-shelf-causes_metrics.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(M, f, indent=1, default=str, ensure_ascii=False)
    print(f"\n{len(M)} metrics written to {out}")
