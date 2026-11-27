#!/usr/bin/env python3
"""Independent math check of the Cloud Factory engagement: analysis/strategy-review.md and the branch files.
Every number in analysis/math-check.md comes from this script.

Run:  python3 analysis/math-check.py            (about 1 minute; numpy + pandas only, no scipy)
      python3 analysis/math-check.py --rerun    (also re-runs every other analysis/*.py in a temporary copy, about
                                                 3 more minutes, and compares their metrics JSON with the repo files)

What it reads (nothing in the repo is changed):
- the DATA block of analysis/baseline.py (everything before "# 2. FRAMES"), exactly as the other scripts do;
- the source of stock-and-ordering.py, cash-and-capital.py and credit-and-collections.py, whose functions are executed
  unchanged (or with one clearly marked line swapped) in a separate namespace, so their models are re-used, not re-typed.
What it writes: analysis/math-check_metrics.json (new file).

Live data (read-only SELECTs through the Supabase connector): md5 fingerprints of sales, sale_items, sale_payments,
stock_movements and products were taken on 26 Nov 2026 20:50 Manila; counts, finance_report and batch state were
re-checked on 27 Nov 09:20 Manila. Nothing had changed since the 18:59 pull. The fingerprints are hard-coded below and
recomputed from the data block here.

Privacy: aggregates only. Buyer numbers in the data block are pseudonymous and are used here only for counts.
"""
import contextlib
import hashlib
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from itertools import permutations

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "baseline.py")
src = open(SRC, encoding="utf-8").read()
block = src.split("# 2. FRAMES")[0]
block = block[: block.rfind("# ----")]
NS = {"pd": pd, "np": np, "json": json, "os": os, "defaultdict": defaultdict}
exec(compile(block, SRC + " [data block]", "exec"), NS)
PRODUCTS, BATCHES, SALES, ITEMS, MOVES = NS["PRODUCTS"], NS["BATCHES"], NS["SALES"], NS["ITEMS"], NS["MOVES"]
PAYMENTS, EXPENSES, ORDER_LINES_B3 = NS["PAYMENTS"], NS["EXPENSES"], NS["ORDER_LINES_B3"]
FIN = NS["FIN_END"]
AS_OF = pd.Timestamp("2026-11-26 18:59")
TODAY = pd.Timestamp("2026-11-26")
DAY = pd.Timedelta(days=1)
P = 100.0
R = {}          # results written to JSON
N_ISSUES = []


def h(t):
    print(f"\n{'=' * 112}\n{t}\n{'=' * 112}")


def put(k, v):
    R[k] = v
    return v


def check(label, claimed, got, tol=0.5, unit=""):
    ok = abs(float(got) - float(claimed)) <= tol
    print(f"  [{'ok ' if ok else 'DIFF'}] {label}: claimed {claimed:,} {unit} | recomputed {got:,.2f} {unit}")
    R.setdefault("checks", []).append(dict(label=label, claimed=claimed, got=round(float(got), 4), ok=bool(ok)))
    return ok


def phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def quiet_exec(code, ns, name):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(compile(code, name, "exec"), ns)
    return buf.getvalue()


# ----------------------------------------------------------------------------------------------------------------
# frames
# ----------------------------------------------------------------------------------------------------------------
prod = pd.DataFrame([(k, *v) for k, v in PRODUCTS.items()], columns=["pid", "line", "flavour", "price", "cost"])
LINE_BATCH = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
prod["batch"] = prod.line.map(LINE_BATCH)
FEES = {1: 23900, 2: 24400, 3: 26400}
PCS = {1: 30, 2: 30, 3: 40}
prod["landed"] = prod.cost + prod.batch.map({b: FEES[b] / PCS[b] for b in FEES})
sales = pd.DataFrame(SALES, columns=["sid", "bd", "ts", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales["bd"] = pd.to_datetime(sales.bd)
sales["ts"] = pd.to_datetime(sales.ts)
done = sales[sales.status == "completed"].copy()
items = pd.DataFrame(ITEMS, columns=["sid", "pid", "q", "up", "uc", "ltot"]).merge(prod, on="pid")
items = items.merge(sales[["sid", "status", "bd", "ts", "pm", "bk"]], on="sid")
it = items[items.status == "completed"].copy()
pays = pd.DataFrame(PAYMENTS, columns=["sid", "amt", "bd", "ts"])
pays["bd"] = pd.to_datetime(pays.bd)
pays["ts"] = pd.to_datetime(pays.ts)
mv = pd.DataFrame(MOVES, columns=["pid", "kind", "delta", "bid", "ts"])
mv["ts"] = pd.to_datetime(mv.ts)
mv = mv.reset_index().sort_values(["ts", "index"]).reset_index(drop=True)

# minute-level stock grid (an independent re-implementation of the running sum of stock_movements.delta)
T0 = pd.Timestamp("2026-10-27 00:00")
MIN = pd.Timedelta(minutes=1)
n_min = int((AS_OF - T0) / MIN)
pids = list(prod.pid)
pidx = {p: i for i, p in enumerate(pids)}
lvl = np.zeros((n_min + 1, len(pids)), dtype=np.int16)
for r in mv.itertuples():
    k = int(math.ceil((r.ts - T0) / MIN))          # a movement at hh:mm:ss counts from the next whole minute
    lvl[k:, pidx[r.pid]] += r.delta
assert (lvl[-1] == 0).all()
open_min = (lvl > 0).any(axis=1)
nflav_min = (lvl > 0).sum(axis=1)
minute_ts = pd.date_range(T0, periods=n_min + 1, freq="min")

# ================================================================================================================
h("1. Live data: do the scripts' data match the database? (md5 of the rows, same text format on both sides)")
# ================================================================================================================
LIVE = dict(sales=("2af234ca87248080b82d958bcea28268", 52), items=("5549a1e9769a30ce68b76286133e0610", 60),
            pays=("ecee93b2ac8151b52cb73845a08d85ca", 36), moves=("be4b93c15b1dfb01997fba770741a6d4", 81),
            products=("bed99d31487f9cb3072d96b21194e660", 31))


def md5(lines):
    return hashlib.md5("\n".join(lines).encode()).hexdigest()


mine = dict(
    sales=md5([f"{r[0]}|{r[1]}|{r[2]}|{r[3]}|{r[4]}|{r[5]}|{r[6]}|{r[7]}|{r[8]}" for r in sorted(SALES, key=lambda r: r[0])]),
    items=md5([f"{r[0]}|{r[1]}|{r[2]}|{r[3]}|{r[4]}|{r[5]}" for r in sorted(ITEMS, key=lambda r: (r[0], r[1]))]),
    pays=md5([f"{r[0]}|{r[1]}|{r[2]}|{r[3]}" for r in sorted(PAYMENTS, key=lambda r: (r[0], r[3], r[1]))]),
    moves=md5([f"{r[0]}|{r[1]}|{r[2]}|{r[3] or '-'}|{r[4]}" for r in sorted(MOVES, key=lambda r: (r[0], r[4], r[1]))]),
    products=md5([f"{k}|{v[2]}|{v[3]}|0|5" for k, v in sorted(PRODUCTS.items())]))
for k, (hsh, n) in LIVE.items():
    print(f"  {k:9s} live {hsh} ({n} rows) | data block {mine[k]} -> {'MATCH' if mine[k] == hsh else 'MISMATCH'}")
put("live_fingerprints_match", all(mine[k] == LIVE[k][0] for k in LIVE))
print("  finance_report (27 Nov 09:20, owner, rolled back): net 19,800, COGS 10,233, opex 740, net profit 8,827, cash 340,"
      " receivables 2,080, on the way 7,214, capital 5,039, kept 4,595, distributions 4,232 -> equal to FIN_END")

# ================================================================================================================
h("2. Fact base re-derived on a minute grid (strategy-review §1-§2, A4, §4.1)")
# ================================================================================================================
net = done.tot.sum() / P
pieces = int(it.q.sum())
gp_landed = float((it.q * (it.up - it.landed)).sum() / P)
gp_unit = float((it.q * (it.up - it.cost)).sum() / P)
open_days = open_min.sum() / 1440
empty_days = (~open_min[minute_ts.searchsorted(pd.Timestamp("2026-10-27 09:16")):]).sum() / 1440
check("net sales", 19800, net, unit="PHP")
check("landed gross profit", 9567, gp_landed, unit="PHP")
check("landed margin %", 48.3, 100 * gp_landed / net, 0.05)
check("unit-cost margin %", 50.8, 100 * gp_unit / net, 0.05)
check("landed margin a piece", 159.45, gp_landed / pieces, 0.01, "PHP")
check("days with any stock", 27.03, open_days, 0.02, "days")
check("days the whole shop was empty", 3.38, empty_days, 0.02, "days")
lam_any = pieces / open_days
check("pace on days with stock", 2.22, lam_any, 0.005, "pcs/day")
check("empty shop-day cost at 2.22/day", 354, lam_any * gp_landed / pieces, 1, "PHP")
check("empty shop-day cost at 3.61/day", 576, 3.61 * gp_landed / pieces, 1, "PHP")
check("ordering at sell-out, 7 x 354", 2478, 7 * 354, 0)
check("... as % of gross profit to date", 26, 100 * 2478 / gp_landed, 0.5)
check("net profit", 8827, gp_landed - 740, 0.5, "PHP")
assets = 340 + 2080 + 0 + 7214
claims = 0 + 0 + 5039 + (8827 - 4232)
check("balance identity: assets = claims", assets, claims, 0)
check("payout share of profit %", 47.9, 100 * 4232 / 8827, 0.05)
op_cash_month = 17720 - 12408 - 740
op_cash_at_payout = op_cash_month - 340          # the 26 Nov collection of PHP 340 came after the payout
check("payout as % of the month's operating cash (review: 92.6%)", 92.6, 100 * 4232 / op_cash_month, 0.05)
print(f"  note: at 07:48 on 25 Nov the operating cash generated so far was PHP {op_cash_at_payout:,} -> the payout was"
      f" {4232 / op_cash_at_payout:.0%} of it; 92.6% divides by cash collected up to 26 Nov")
put("payout_share_op_cash_at_the_time", 4232 / op_cash_at_payout)

# ================================================================================================================
h("3. Engine replay (§4.3, §9.1): independent numeric integration of the recency-weighted pace")
# ================================================================================================================
LUMP_LINE = float((it.q ** 2).sum() / it.q.sum())
tick = it.groupby("sid").q.sum()
LUMP_TICKET = float((tick ** 2).sum() / tick.sum())
R_AD, L, SDL, Z = 14.5, 7.0, 1.75, 1.645
H = min(56.0, max(21.0, 2 * R_AD))
age_min = np.asarray((AS_OF - minute_ts) / DAY, dtype=float)
w_min = 0.5 ** (age_min / H)
shop_ex = float((w_min * open_min).sum() / 1440)
shop_ws = float(sum(0.5 ** (((AS_OF - r.ts) / DAY) / H) * r.q for r in it.itertuples()))
lam = shop_ws / shop_ex
rop = lam * L + Z * math.sqrt(L * lam * LUMP_LINE + lam ** 2 * SDL ** 2)
tgt = lam * (L + R_AD) + Z * math.sqrt((L + R_AD) * lam * LUMP_LINE + lam ** 2 * SDL ** 2)
check("lambda (adopted, H 29)", 2.014, lam, 0.003, "pcs/day")
check("reorder point", 22.64, rop, 0.03, "pcs")
check("target", 55.73, tgt, 0.05, "pcs")
check("next order = round(target - ROP)", 33, round(tgt - rop), 0)
pos_shop, pos_pods = 33, 30
due = pd.Timestamp("2026-11-25") + pd.Timedelta(days=round(L))
ob = due + pd.Timedelta(days=math.floor((pos_shop - rop) / lam))
ob_pods = due + pd.Timedelta(days=math.floor((pos_pods - rop) / lam))
print(f"  order by {ob:%a %d %b} (review: Mon 07 Dec); pods only {ob_pods:%a %d %b} (review: Sat 05 Dec)")
put("engine", dict(lam=lam, rop=rop, tgt=tgt, order_by=str(ob.date()), order_by_pods=str(ob_pods.date())))
# sensitivity of the order-by date to the pace Batch 3 actually sells at (the review's own full-shelf pace is 3.61)
print("  order-by date if Batch 3 sells at a different pace (ROP re-computed at that pace, position 33, due 2 Dec):")
ob_rows = []
for lam_x in (2.01, 2.5, 2.8, 3.38, 3.61):
    rop_x = lam_x * L + Z * math.sqrt(L * lam_x * LUMP_LINE + lam_x ** 2 * SDL ** 2)
    days_x = math.floor((pos_shop - rop_x) / lam_x)
    d_x = due + pd.Timedelta(days=max(0, days_x))
    ob_rows.append((lam_x, round(rop_x, 1), str(d_x.date())))
    print(f"     pace {lam_x:4.2f}: reorder point {rop_x:5.1f} -> order by {d_x:%a %d %b}{' (on arrival)' if days_x <= 0 else ''}")
put("order_by_vs_pace", ob_rows)
# how fast does the engine's pace react? Batch 3 arrives 2 Dec 12:00 and sells 3.61 a day; recompute lambda each evening
print("  how fast the engine reacts if Batch 3 sells 3.61 a day from 2 Dec 12:00 (H 29, nothing else changes):")
react = []
for d_ in range(0, 6):
    t_eval = pd.Timestamp("2026-12-02 19:00") + pd.Timedelta(days=d_)
    k = 0.5 ** (((t_eval - AS_OF) / DAY) / H)                           # old weights shrink as time passes
    open_new = (t_eval - pd.Timestamp("2026-12-02 12:00")) / DAY
    sold_new = 3.61 * open_new
    # new sales and exposure, weighted at their age (exact integral of 0.5^(age/H) over the open time)
    w_int = (H / math.log(2)) * (1 - 0.5 ** (open_new / H))
    lam_t = (shop_ws * k + 3.61 * w_int) / (shop_ex * k + w_int)
    rop_t = lam_t * L + Z * math.sqrt(L * lam_t * LUMP_LINE + lam_t ** 2 * SDL ** 2)
    pos_t = pos_shop - sold_new
    react.append((str(t_eval.date()), round(lam_t, 2), round(rop_t, 1), round(pos_t, 1)))
    print(f"     {t_eval:%a %d %b}: lambda {lam_t:.2f}, reorder point {rop_t:4.1f}, position {pos_t:4.1f}"
          f" -> {'ORDER NOW' if pos_t <= rop_t else 'not yet'}")
put("engine_reaction", react)

# ================================================================================================================
h("4. Fits your money (§1, §4.3, §4.6, card 7): what PHP 2,420 buys when the order's fee is charged once")
# ================================================================================================================
# Run the strategy review's own engine (its sections A, quietly; that part writes nothing) to get the same pace ranking
SR = open(os.path.join(HERE, "strategy-review.py"), encoding="utf-8").read()
ns_sr = {"__file__": os.path.join(HERE, "strategy-review.py"), "__name__": "sr_check"}
quiet_exec(SR[: SR.index('h("B. Next-order estimate')], ns_sr, "strategy-review.py [frames + section A]")
AD = ns_sr["AD"]
FEE_AVG, AVG_PCS = (239 + 244 + 264) / 3, 100 / 3


def fees_for(q):
    return 0.0 if q <= 0 else round(FEE_AVG * max(1.0, q / AVG_PCS))


cost_of = prod.set_index("pid").cost / P
order_pcs = [p for n, _, p in sorted((n, -AD["pace"][p], p) for p in prod.pid for n in range(1, AD["sug"][p] + 1))]
ranked_costs = [float(cost_of[p]) for p in order_pcs]
lines_first14 = prod.set_index("pid").line[order_pcs[:14]].value_counts().to_dict()
budget = 340 + 0 + 2080
prop_rate = AD["fees"] / AD["goods"]            # the engine's fee share of the whole suggestion (fees / goods)
fit_review = max(q for q in range(0, len(ranked_costs) + 1) if sum(ranked_costs[:q]) * (1 + prop_rate) <= budget)
fit_per_order = max(q for q in range(0, len(ranked_costs) + 1) if sum(ranked_costs[:q]) + fees_for(q) <= budget)
fit_linear = max(q for q in range(0, len(ranked_costs) + 1) if sum(ranked_costs[:q]) + (174 + 2.25 * q if q else 0) <= budget)
g14 = sum(ranked_costs[:14])
print(f"  engine suggestion {AD['pcs']} pcs, goods PHP {AD['goods']:,.0f}, fees PHP {AD['fees']:,.0f}; first 14 pieces: {lines_first14}")
print(f"  review method (each piece carries {prop_rate:.2%} of fees): fits {fit_review} pcs = PHP {g14 * (1 + prop_rate):,.0f}")
print(f"  fee charged once per order (design's fee rule, PHP {fees_for(14):.0f} for 14 pcs): 14 pcs cost PHP "
      f"{g14 + fees_for(14):,.0f} > 2,420 -> fits {fit_per_order} pcs (PHP "
      f"{sum(ranked_costs[:fit_per_order]) + fees_for(fit_per_order):,.0f})")
print(f"  fee from the review's own fit (174 + 2.25 a piece): fits {fit_linear} pcs")
put("fits_money", dict(review=fit_review, per_order_fee=fit_per_order, linear_fee=fit_linear))

# ================================================================================================================
h("5. Collections thresholds and the money-check budget (§4.4, §9.1 item 6, card 9)")
# ================================================================================================================
credit = done[done.pm == "unpaid"]
last_pay = pays.groupby("sid").bd.max()
paid_days = sorted(int((last_pay[s.sid] - s.bd) / DAY) for s in credit.itertuples() if s.bal == 0)


def pdisc(xs, q):
    xs = sorted(xs)
    return xs[max(0, math.ceil(q * len(xs)) - 1)]


u, la = pdisc(paid_days, .5), pdisc(paid_days, .8)
vla = max(pdisc(paid_days, .95), la + 7)
check("paid-in-full count", 31, len(paid_days), 0)
check("usual (p50)", 9, u, 0)
check("Late after (p80)", 11, la, 0)
check("Very late after", 18, vla, 0)
check("good payers a 7-day rule marks Late", 20, sum(d > 7 for d in paid_days), 0)
check("good payers v3 marks Late", 5, sum(d > la for d in paid_days), 0)
open_b = [(int((TODAY - s.bd) / DAY), s.bal / P) for s in credit.itertuples() if s.bal > 0]
check("owed, usual", 1700, sum(b for a, b in open_b if a <= la), 0)
check("owed, Late", 380, sum(b for a, b in open_b if la < a <= vla), 0)
# probability-weighted collections by the order day (7 Dec): P(paid by age on 7 Dec | still open at today's age)
od = pd.Timestamp("2026-12-07")
ahead = int((od - TODAY) / DAY)
pw = 0.0
for a, b in open_b:
    pool = [d for d in paid_days if d > a]
    pw += b * (sum(d <= a + ahead for d in pool) / len(pool) if pool else 0.0)
print(f"  budget counts PHP 2,080 of open balances; probability-weighted by 7 Dec (paid-in-full history) PHP {pw:,.0f}"
      f" -> difference PHP {2080 - pw:,.0f} (review: PHP 86)")
put("prob_weighted_collections_7dec", pw)
el = 1700 * 0.5 / 32 + 380 * 0.5 / 6
check("expected bad debt on today's book", 58, el, 1, "PHP")
rng = np.random.default_rng(1)
u95 = float(np.quantile(rng.beta(0.5, 31.5, 400000), 0.95))
check("Jeffreys 95% upper PD, 0 of 31 (%)", 6.0, 100 * u95, 0.1)
check("bad debt on new credit a month", 220, 14540 * 30 / 31 * 0.5 / 32, 1, "PHP")

# ================================================================================================================
h("6. Payout rule test (§4.2, §9.1 item 3)")
# ================================================================================================================
hold = max(0, 5664 - 0 - 2080)
for name, spare, run in (("25 Nov 07:48", 4232, 740), ("26 Nov", 340, 716)):
    v2 = max(0, min(spare, spare - run))
    ad = max(0, min(spare, spare - hold - run))
    print(f"  {name}: hold {hold:,}; v2 {v2:,}; adopted {ad:,} (margin to a positive pre-fill: PHP {hold + run - spare:,})")
put("payout_rule_margin_25nov", hold + 740 - 4232)

# ================================================================================================================
h("7. Working capital at a full shelf (§4.2 'needs PHP 10,903 ... 6,566 on pick-up; equity 9,634'; cash §4.7)")
# ================================================================================================================
DSO, DIO, PREPAID = 6.21, 4.39, 7.0
sales_day = net / 31
cogs_day = 10233 / 31
avg_ic_measured = 5884
branch_formula = (DSO + DIO + 1.4) * cogs_day                    # the branch's formula, with the 1.4 days on the way so far
right_formula = DSO * sales_day + (DIO + 1.4) * cogs_day         # receivables at sale value, stock at landed cost
print(f"  test on history: measured average invested capital PHP {avg_ic_measured:,};"
      f" branch formula (CCC x COGS a day) PHP {branch_formula:,.0f}; receivables at sale value PHP {right_formula:,.0f}")
rows = []
for lab, pcs_day, price, unit in (("recorded", 60 / 31, 330.0, 10233 / 60),
                                  ("plan pace 2.0", 2.0, 340.0, 171.6), ("full shelf 3.61", 3.61, 340.0, 171.6)):
    s_day, c_day = pcs_day * price, pcs_day * unit
    for terms, extra in (("pay at order", PREPAID), ("pick-up", 0.0)):
        b = (DSO + DIO + extra) * c_day
        c = DSO * s_day + (DIO + extra) * c_day
        rows.append(dict(volume=lab, terms=terms, branch=round(b), corrected=round(c), understated_by=round(c - b)))
wc = pd.DataFrame(rows)
print(wc.to_string(index=False))
put("working_capital", wc.to_dict("records"))

# ================================================================================================================
h("8. Self-funded growth and the payout cap (§4.2 '45% a cycle ... payouts up to about 64%'; card 8)")
# ================================================================================================================
need = 3.61 * 14.5 / 40 - 1
roi_batch = np.mean([3921 / 5039, 4906 / 5194])
profit_cycle = 8827 / 31 * 14.5
roic_cycle = profit_cycle / avg_ic_measured
print(f"  growth needed for a full-shelf order: {need:.1%}")
for lab, base in (("batch net profit / batch cost (branch)", roi_batch),
                  ("net profit per 14.5 days / average money tied up (5,884)", roic_cycle),
                  ("net profit per 14.5 days / equity today (9,634)", profit_cycle / 9634)):
    print(f"  {lab:58s}: return {base:5.1%} a cycle -> growth at 47.9% payout {(1 - .479) * base:5.1%};"
          f" payout cap for {need:.0%} growth {1 - need / base:5.1%}")
put("payout_cap", dict(branch=1 - need / roi_batch, on_avg_capital=1 - need / roic_cycle, on_equity=1 - need / (profit_cycle / 9634)))

# ================================================================================================================
h("9. Profit bridge October -> November (§4.5, cards 1 and 15): does '53% of the drop' depend on the order of steps?")
# ================================================================================================================


def period(a, b, bd_from, bd_to):
    ia, ib = minute_ts.searchsorted(a), minute_ts.searchsorted(b)
    o_days = open_min[ia:ib].sum() / 1440
    fl_days = (lvl[ia:ib] > 0).sum() / 1440
    days = (min(b, AS_OF) - a) / DAY
    s = it[(it.bd >= pd.Timestamp(bd_from)) & (it.bd <= pd.Timestamp(bd_to))]          # completed sales by business date
    q = s.q.sum()
    gross = (s.q * s.up).sum() / P
    goods = (s.q * s.cost).sum() / P
    fee = (s.q * (s.landed - s.cost)).sum() / P
    return dict(days=days, o=o_days / days, f=fl_days / o_days, qf=q / fl_days, Q=q / days, m=(gross - goods - fee) / q,
                price=gross / q, goods=goods / q, fee=fee / q)


oc = period(pd.Timestamp("2026-10-27"), pd.Timestamp("2026-11-01"), "2026-10-27", "2026-10-31")
nv = period(pd.Timestamp("2026-11-01"), AS_OF, "2026-11-01", "2026-11-26")
exp_day = (0.0, 740 / nv["days"])
np_oct = oc["Q"] * oc["m"] - exp_day[0]
np_nov = nv["Q"] * nv["m"] - exp_day[1]
check("October net profit a day", 730, np_oct, 1, "PHP")
check("November net profit a day", 201, np_nov, 1, "PHP")
print(f"  Oct: open share {oc['o']:.3f}, flavours {oc['f']:.2f}, pieces/flavour-day {oc['qf']:.3f};"
      f" Nov: {nv['o']:.3f}, {nv['f']:.2f}, {nv['qf']:.3f}")
drop = np_nov - np_oct
facs = ["o", "f", "qf"]
contrib_by_order = {}
for order in permutations(facs):
    cur = {k: oc[k] for k in facs}
    eff = {}
    for k in order:
        before = cur["o"] * cur["f"] * cur["qf"]
        cur[k] = nv[k]
        eff[k] = (cur["o"] * cur["f"] * cur["qf"] - before) * oc["m"]
    contrib_by_order[order] = eff
shap = {k: np.mean([contrib_by_order[o][k] for o in contrib_by_order]) for k in facs}
lnQ = math.log(nv["Q"] / oc["Q"])
vol_eff = (nv["Q"] - oc["Q"]) * oc["m"]
lmdi = {k: vol_eff * math.log(nv[k] / oc[k]) / lnQ for k in facs}
print(f"  change in net profit a day {drop:,.2f}; volume part {vol_eff:,.2f}")
print(f"  {'order of the three steps':38s} {'days w/ stock':>13s} {'flavours':>9s} {'per flavour':>11s} {'in-stock share':>15s}")
share_rows = []
for o, e in contrib_by_order.items():
    s_ = (e["o"] + e["f"]) / -drop
    share_rows.append(s_)
    tag = "  <- the review's order" if o == ("o", "f", "qf") else ""
    print(f"  {' -> '.join(o):38s} {e['o']:13.1f} {e['f']:9.1f} {e['qf']:11.1f} {s_:15.1%}{tag}")
print(f"  {'Shapley (average of the 6 orders)':38s} {shap['o']:13.1f} {shap['f']:9.1f} {shap['qf']:11.1f}"
      f" {(shap['o'] + shap['f']) / -drop:15.1%}")
print(f"  {'log-mean (LMDI, order-free)':38s} {lmdi['o']:13.1f} {lmdi['f']:9.1f} {lmdi['qf']:11.1f}"
      f" {(lmdi['o'] + lmdi['f']) / -drop:15.1%}")
put("bridge_in_stock_share", dict(review=share_rows[0], min=min(share_rows), max=max(share_rows),
                                  shapley=(shap["o"] + shap["f"]) / -drop, lmdi=(lmdi["o"] + lmdi["f"]) / -drop))
print(f"  biggest minus under the review's order: flavours ({contrib_by_order[('o', 'f', 'qf')]['f']:.0f}) vs per flavour"
      f" ({contrib_by_order[('o', 'f', 'qf')]['qf']:.0f}); under o -> qf -> f: per flavour"
      f" ({contrib_by_order[('o', 'qf', 'f')]['qf']:.0f}) vs flavours ({contrib_by_order[('o', 'qf', 'f')]['f']:.0f})")

# ================================================================================================================
h("10. Spare stock: is day-to-day demand as smooth as the formula assumes? (A10, card 5 '1 order cycle in 20')")
# ================================================================================================================
dates = pd.date_range("2026-10-28", "2026-11-25", freq="D")          # whole days only
day_rows = []
for d in dates:
    ia, ib = minute_ts.searchsorted(d), minute_ts.searchsorted(d + DAY)
    full_open = bool(open_min[ia:ib].all())
    min_fl = int(nflav_min[ia:ib].min())
    pcs_d = int(it[(it.ts >= d) & (it.ts < d + DAY)].q.sum())
    day_rows.append(dict(day=d, open_all_day=full_open, min_flavours=min_fl, pieces=pcs_d))
dd = pd.DataFrame(day_rows)
disp = {}
for lab, sel in (("days with stock all day", dd.open_all_day), ("days with 7+ flavours all day", dd.min_flavours >= 7)):
    x = dd[sel].pieces
    disp[lab] = dict(n=int(len(x)), mean=float(x.mean()), var=float(x.var(ddof=1)), idx=float(x.var(ddof=1) / x.mean()))
    print(f"  {lab:32s}: {len(x):2d} days, mean {x.mean():.2f}, variance {x.var(ddof=1):.2f}, variance / mean"
          f" {x.var(ddof=1) / x.mean():.2f} (formula assumes {LUMP_LINE:.3f})")
print(f"  lumpiness per sale line {LUMP_LINE:.3f}; per sale (ticket) {LUMP_TICKET:.3f}")
# does the spread average out over several days (bursts followed by quiet days)? non-overlapping 2- and 3-day sums
for span in (2, 3):
    sums = []
    runs = (dd.open_all_day.values.astype(int))
    i = 0
    while i + span <= len(dd):
        if runs[i:i + span].all():
            sums.append(int(dd.pieces.values[i:i + span].sum()))
            i += span
        else:
            i += 1
    x = np.array(sums)
    print(f"  {span}-day sums on days with stock: {len(x)} blocks, mean {x.mean():.2f}, variance / mean {x.var(ddof=1) / x.mean():.2f}")
    put(f"dispersion_{span}day", float(x.var(ddof=1) / x.mean()))
spare_review = rop - lam * L
for lab, idx in (("formula (line lumpiness)", LUMP_LINE), ("per-ticket lumpiness", LUMP_TICKET),
                 ("measured, days with stock all day", disp["days with stock all day"]["idx"])):
    sd = math.sqrt(L * lam * idx + lam ** 2 * SDL ** 2)
    print(f"  {lab:36s}: lead-time spread {sd:4.2f} pcs; the 8.55 spare pieces give z {spare_review / sd:4.2f}"
          f" = {phi(spare_review / sd):5.1%} of cycles without running short; 95% needs {1.645 * sd:4.1f} spare")
put("dispersion", disp)
put("lump", dict(line=LUMP_LINE, ticket=LUMP_TICKET))

# ================================================================================================================
h("11. 'Buyers leave' vs novelty: what the full-shelf days show (§2, A3, H1)")
# ================================================================================================================
for b, arr, line in ((1, pd.Timestamp("2026-10-27 09:15:05"), "XBLACK MAX"), (2, pd.Timestamp("2026-11-09 20:07:37"), "Black TEO")):
    cols = [pidx[p] for p in prod[prod.line == line].pid]
    ia = minute_ts.searchsorted(arr)
    nl = (lvl[:, cols] > 0).sum(axis=1)
    below = np.where(nl[ia:] < 7)[0]
    end = minute_ts[ia + below[0]] if len(below) else AS_OF
    half = arr + (end - arr) / 2
    s1 = it[(it.ts >= arr) & (it.ts < half) & (it.line == line)].q.sum()
    s2 = it[(it.ts >= half) & (it.ts < end) & (it.line == line)].q.sum()
    dlen = (end - arr) / DAY
    print(f"  Batch {b}: 7+ flavours on the shelf for {dlen:.1f} days; first half {s1} pcs ({s1 / (dlen / 2):.2f}/day),"
          f" second half {s2} pcs ({s2 / (dlen / 2):.2f}/day)")
dly = it.groupby(it.ts.dt.normalize()).q.sum()
print("  Batch 2 daily pieces 10-17 Nov:", {d.strftime("%d"): int(dly.get(d, 0)) for d in pd.date_range("2026-11-10", "2026-11-17")})
# how well does the stock branch's fit pin down the switch share? its loss function, re-run with 6 different seeds
SOc = open(os.path.join(HERE, "stock-and-ordering.py"), encoding="utf-8").read()
ns_fit = {"__file__": os.path.join(HERE, "stock-and-ordering.py"), "__name__": "fit_check"}
quiet_exec(SOc[: SOc.index("GRID_D = [")], ns_fit, "stock-and-ordering.py [A-C definitions]")
fit_rows = {}
for s_, sig_, d1_, d2_ in ((0.15, 0.4, 4.5, 2.75), (0.30, 0.7, 4.0, 2.25), (0.45, 0.7, 3.5, 2.0)):
    losses = []
    for seed in range(101, 107):
        tot = 0.0
        for b, D_ in ((1, d1_), (2, d2_)):
            tot += ns_fit["loss"](ns_fit["fit_stats"](D_, s_, sig_, 150, seed * 10 + b), ns_fit["obs"][b])
        losses.append(tot)
    fit_rows[s_] = (float(np.mean(losses)), float(np.std(losses, ddof=1)))
    print(f"  fit loss at {s_:.0%} switching (its best spread and buyers a day), 6 seeds: mean {np.mean(losses):.2f},"
          f" sd {np.std(losses, ddof=1):.2f}, range {min(losses):.2f}-{max(losses):.2f}")
put("fit_noise", fit_rows)
floor_gain = (3.82 - 0.84) * 354
print(f"  if only whole-shop-empty days lose sales (no walk-outs from thin shelves): gain from ordering on time ="
      f" (3.82 - 0.84 empty days a month) x PHP 354 = PHP {floor_gain:,.0f} a month (review headline: +3.2k to 4.7k)")
put("floor_gain_month", floor_gain)

# ================================================================================================================
h("12. The stock simulation, re-run with its own code (§4.1 table, R1 and R3)")
# ================================================================================================================
SO = open(os.path.join(HERE, "stock-and-ordering.py"), encoding="utf-8").read()
ns_s = {"__file__": os.path.join(HERE, "stock-and-ordering.py"), "__name__": "stock_check"}
part1 = SO[: SO.index('h("C. Demand model')]
part2 = SO[SO.index('h("D. Order economics'): SO.index("D_BASE = float(D2)")]
quiet_exec(part1, ns_s, "stock-and-ordering.py [A-B]")
ns_s.update(D1=4.5, D2=2.75, S_BEST=0.15, SIG_BEST=0.4)            # the branch's fitted values (section C not re-run)
quiet_exec(part2, ns_s, "stock-and-ordering.py [D-F definitions]")
old_keep = '                keep = 0.0 if payout == "all" else S_full * (COST + b_fee) + a_fee\n'
assert SO.count(old_keep) == 1
new_keep = (
    '                if payout == "adopted":            # math-check: the adopted suggestion rule (strategy review §4.2)\n'
    '                    pos_now = int(stock.clip(0).sum()) + sum(x[1] for x in pipe)\n'
    '                    q_next = max(0, int(round(S_full - rop)))\n'
    '                    cost_next = q_next * COST + (a_fee + b_fee * q_next if q_next > 0 else 0.0)\n'
    '                    d_to = max(0.0, (pos_now - rop) / lam_hat) if lam_hat > 0 else 0.0\n'
    '                    coll = float(inflow[t + 1:t + 1 + int(math.ceil(d_to))].sum())\n'
    '                    keep = max(0.0, cost_next - coll) + OPEX_DAY * 30\n'
    '                else:\n'
    '                    keep = 0.0 if payout == "all" else S_full * (COST + b_fee) + a_fee\n')
sim_src = SO[SO.index("def sim_policy("): SO.index("D_BASE = float(D2)")].replace(old_keep, new_keep)
quiet_exec(sim_src, ns_s, "stock-and-ordering.py [sim_policy, one rule added]")
sim = ns_s["sim_policy"]
srows = {}
for pol in ("sellout", "rop_S"):
    for pay in ("all", "next", "adopted"):
        r = sim(pol, 2.75, 0.15, 0.4, payout=pay, seed=11)
        srows[(pol, pay)] = r
        print(f"  {pol:8s} payout rule {pay:8s}: gross profit PHP {r.gp_month:7,.0f} a month, payouts PHP {r.payout_month:6,.0f},"
              f" empty days {r.empty_days_month:.2f}, fill {r.fill:.0%}")
print(f"  reproduces the branch: sellout/all {srows[('sellout', 'all')].gp_month:,.0f} (6,674), rop_S/all"
      f" {srows[('rop_S', 'all')].gp_month:,.0f} (10,712), rop_S/next {srows[('rop_S', 'next')].gp_month:,.0f} (11,144)")
g_all = srows[("rop_S", "all")].gp_month - srows[("sellout", "all")].gp_month
g_next = srows[("rop_S", "next")].gp_month - srows[("sellout", "next")].gp_month
g_ad = srows[("rop_S", "adopted")].gp_month - srows[("rop_S", "all")].gp_month
print(f"  R1 gain with the same cash rule on both sides: pay out all {g_all:,.0f}; keep the next order {g_next:,.0f}"
      f" (the tests +3,221 to +4,706 use the 'keep' rule)")
print(f"  R3: the sim's 'keep' rule holds S_full x cost (~PHP 9-10k); the adopted rule holds next order - collections +"
      f" a month of costs. Adopted rule adds {g_ad:+,.0f} a month over 'pay out all' (review: +432 for the 'keep' rule)")
put("sim", {f"{k[0]}/{k[1]}": dict(gp=float(v.gp_month), payout=float(v.payout_month)) for k, v in srows.items()})
put("R1_gain_same_rule", dict(pay_all=g_all, keep_next=g_next))
put("R3_adopted_rule_gain", g_ad)
cash_e = ns_s["next_order_case"](7, ns_s["lam_any"], cost_q=5664.0)
print(f"  stock branch's Batch 4 case at the adopted PHP 5,664 order: cash on the order day PHP {cash_e['cash_at_want']:,.0f},"
      f" short PHP {cash_e['short']:,.0f}, extra empty days {cash_e['gap']:.1f} -> PHP {cash_e['gap'] * ns_s['lam_any'] * 159.45:,.0f}")
put("stock_case_5664", dict(short=cash_e["short"], gap=cash_e["gap"]))

# ================================================================================================================
h("13. Cash Monte Carlo and credit timing model at the ADOPTED next order (PHP 5,664, 7 Dec) instead of PHP 6,224")
# ================================================================================================================
CC = open(os.path.join(HERE, "cash-and-capital.py"), encoding="utf-8").read()
ns_c = {"__file__": os.path.join(HERE, "cash-and-capital.py"), "__name__": "cash_check"}
quiet_exec(CC[: CC.index("base_kw = dict(n=10000)")], ns_c, "cash-and-capital.py [to the simulator]")
for lab, cost in (("branch, PHP 6,224", 622400.0), ("adopted, PHP 5,664", 566400.0)):
    o = ns_c["simulate"](n=10000, start_cash=34000.0, rule="rop", pay="order", cost=cost)
    s = ns_c["summarize"](o, lab)
    print(f"  S1 {lab:20s}: short in {s['p_short']:.0%} of trials, median top-up PHP {s['topup_p50']:,.0f},"
          f" gross profit lost PHP {s['lost_gp_avg']:,.0f}-{s['lost_gp_full']:,.0f}")
    put(f"cash_mc_{cost:.0f}", dict(p_short=float(s["p_short"]), topup=float(s["topup_p50"]), lost=float(s["lost_gp_avg"])))
CR = open(os.path.join(HERE, "credit-and-collections.py"), encoding="utf-8").read()
ns_r = {"__file__": os.path.join(HERE, "credit-and-collections.py"), "__name__": "credit_check"}
quiet_exec(CR[: CR.index("# 8. WRITE METRICS")], ns_r, "credit-and-collections.py [to the end of 7d]")
for lab, cost, obd in (("branch, PHP 6,224 on 5 Dec", 6224.0, "2026-12-05"), ("adopted, PHP 5,664 on 7 Dec", 5664.0, "2026-12-07")):
    r0 = ns_r["projection"](order_cost=cost, order_by=pd.Timestamp(obd))
    r1 = ns_r["projection"](order_cost=cost, order_by=pd.Timestamp(obd), credit_share=0.0)
    print(f"  credit {lab:28s}: cash on the day PHP {r0['cash_on_order_by']:,.0f} (vs {r1['cash_on_order_by']:,.0f} with no"
          f" new credit) -> held back PHP {r1['cash_on_order_by'] - r0['cash_on_order_by']:,.0f}; lost PHP {r0['gp_lost']:,.0f}"
          f" vs {r1['gp_lost']:,.0f}")
    put(f"credit_timing_{cost:.0f}", dict(held_back=r1["cash_on_order_by"] - r0["cash_on_order_by"], lost=r0["gp_lost"] - r1["gp_lost"]))

# ================================================================================================================
h("14. Smaller items")
# ================================================================================================================
# 14a  PHP 766 loss 'at PHP 10k a month of rent and pay'
print(f"  a) GP 9,567 - 10,000 x 31/30 = {gp_landed - 10000 * 31 / 30:,.0f} (the review's -766 treats 10k as ALL running costs);"
      f" rent and pay of 10k ON TOP of the recorded 740: {8827 - 10000 * 31 / 30:,.0f}")
# 14b  Batch 2 'made PHP 985 more in total'
gpb = {b: float((it[it.batch == b].q * (it[it.batch == b].up - it[it.batch == b].landed)).sum() / P) for b in (1, 2)}
print(f"  b) batch gross profit B1 {gpb[1]:,.0f}, B2 {gpb[2]:,.0f} -> +{gpb[2] - gpb[1]:,.0f}; net (after the PHP 640 and"
      f" PHP 100 expenses charged to them) 3,921 -> 4,906 = +985; per day on the shelf GP 439 -> 301 (-31%), net 378 -> 295 (-22%)")
# 14c  repeat buyers 'rotate flavours': was the flavour they had bought before still on the shelf?
bl = it.sort_values("ts")
reps = bl.groupby("bk").sid.nunique()
cnt = dict(new_flav=0, new_flav_old_available=0, same=0)
for bk, g in bl[bl.bk.isin(reps[reps >= 2].index)].groupby("bk"):
    seen = defaultdict(set)
    for sid, gg in g.groupby("sid", sort=False):
        t = gg.ts.iloc[0]
        k = int((t - T0) / MIN)
        for line in set(gg.line):
            if line in seen:
                now = set(gg[gg.line == line].pid)
                if now & seen[line]:
                    cnt["same"] += 1
                else:
                    cnt["new_flav"] += 1
                    if any(lvl[k, pidx[p]] > 0 for p in seen[line]):
                        cnt["new_flav_old_available"] += 1
        for p, line in zip(gg.pid, gg.line):
            seen[line].add(p)
print(f"  c) repeat buys inside a known line: same flavour {cnt['same']}, new flavour {cnt['new_flav']}; of the new-flavour"
      f" buys, the buyer's earlier flavour was still on the shelf in {cnt['new_flav_old_available']}")
put("rotation", cnt)
# 14d  how much of the line speed gap the price gap explains: shortfall ratio vs log
ratio = 1.41 / 2.34
for e in (-0.4, -1.2, -2.2):
    lin = (1 - 1.0625 ** e) / (1 - ratio)
    lg = e * math.log(1.0625) / math.log(ratio)
    print(f"  d) elasticity {e}: share of the speed gap {lin:.1%} (review's basis) / {lg:.1%} (log basis, as its -8.4 is)")
print(f"     elasticity that explains all of it: {math.log(ratio) / math.log(1.0625):.2f}")
# 14e  restocking fee rule at larger orders
for q in (33, 36, 52, 70, 100):
    print(f"  e) fees for {q:3d} pcs: design rule PHP {fees_for(q):4.0f} vs the review's own fit 174 + 2.25q PHP {174 + 2.25 * q:4.0f}")
# 14f  delivery doubt: share of variance vs share of pieces (stock branch says '48% of spare stock' and 'half')
for lam_x in (2.22,):
    full = Z * math.sqrt(L * lam_x * LUMP_LINE + lam_x ** 2 * SDL ** 2)
    nodoubt = Z * math.sqrt(L * lam_x * LUMP_LINE)
    var_share = lam_x ** 2 * SDL ** 2 / (L * lam_x * LUMP_LINE + lam_x ** 2 * SDL ** 2)
    print(f"  f) at {lam_x}/day: spare {full:.2f} pcs, {nodoubt:.2f} with delivery known exactly -> delivery doubt is"
          f" {var_share:.0%} of the variance but {(full - nodoubt) / full:.0%} of the pieces")
# 14g  baseline §5 'PHP 11,786 before 25 Nov'
print("  g) cash at the end of 24 Nov was PHP 11,446 (cash branch); 340 + 7,214 + 4,232 = 11,786 includes the PHP 340"
      " collected on 26 Nov")
# 14h  order rhythm: which dates make R = 14.5?
for lab, ds in (("arrival, arrival, ORDER (adopted)", ["2026-10-27", "2026-11-09", "2026-11-25"]),
                ("order days imputed as arrival - 7 (v2)", ["2026-10-20", "2026-11-02", "2026-11-25"]),
                ("arrival days, Batch 3 due 2 Dec", ["2026-10-27", "2026-11-09", "2026-12-02"])):
    t = pd.to_datetime(ds)
    gaps = [(b - a) / DAY for a, b in zip(t, t[1:])]
    print(f"  h) {lab:40s}: gaps {gaps} -> R {np.mean(gaps):.1f}")
# 14i  ranking scores
for nm, mid, fz in (("R1", 4038, .9), ("R5", 1590, .6), ("R3", 700, .9), ("R9", 479, .9), ("R4", 600, .6)):
    print(f"  i) {nm}: {mid} x {fz} = {mid * fz:,.1f}")
# 14j  EOQ cover range quoted as 'economic order cover 29-37 days'
for lam_x in (2.22, 3.61):
    q_star = math.sqrt(2 * lam_x * 174 / (0.25 * 165 / 365))
    print(f"  j) EOQ at {lam_x}/day, 25%/yr: {q_star:.0f} pcs = {q_star / lam_x:.0f} days of cover")
# 14k  service level 90-97.5%: change in the order and in the reorder point
for zz in (1.2816, 1.645, 1.96):
    r_ = lam * L + zz * math.sqrt(L * lam * LUMP_LINE + lam ** 2 * SDL ** 2)
    t_ = lam * (L + R_AD) + zz * math.sqrt((L + R_AD) * lam * LUMP_LINE + lam ** 2 * SDL ** 2)
    print(f"  k) z {zz}: reorder point {r_:.1f}, target {t_:.1f}, next order {round(t_ - r_)}")

# ----------------------------------------------------------------------------------------------------------------
if "--rerun" in sys.argv:
    h("15. Re-run every other analysis/*.py in a temporary copy and compare the metrics files")
    tmp = tempfile.mkdtemp(prefix="cf-mathcheck-")
    for f in os.listdir(HERE):
        if f.endswith(".py") and f != "math-check.py":
            shutil.copy(os.path.join(HERE, f), tmp)
    for f in sorted(os.listdir(tmp)):
        if f.endswith(".py"):
            p = subprocess.run([sys.executable, "-I", os.path.join(tmp, f)], capture_output=True, text=True, cwd=tmp)
            js = f.replace(".py", "_metrics.json")
            same = None
            if os.path.exists(os.path.join(tmp, js)) and os.path.exists(os.path.join(HERE, js)):
                same = json.load(open(os.path.join(tmp, js))) == json.load(open(os.path.join(HERE, js)))
            print(f"  {f:28s} exit {p.returncode}; metrics file {'identical' if same else ('none' if same is None else 'DIFFERENT')}")
    shutil.rmtree(tmp)

json.dump(R, open(os.path.join(HERE, "math-check_metrics.json"), "w"), indent=1, default=str)
print("\nwrote analysis/math-check_metrics.json")
