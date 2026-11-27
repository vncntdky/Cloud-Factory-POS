#!/usr/bin/env python3
"""Independent check of analysis/empty-shelf-causes.md: the empty-shelf cost split by cause.

Every number in analysis/empty-shelf-causes-check.md comes from this script.

Run:  python3 analysis/empty-shelf-causes-check.py           (offline; numpy + pandas; about 30 seconds)
      python3 analysis/empty-shelf-causes-check.py --no-mc   (skip the cash Monte Carlo re-runs; a few seconds)

Independence
- Written from scratch for the check. It doesn't import or copy analysis/empty-shelf-causes.py.
- The consultant cuts each stretch at "breakpoints" and classifies the middle of each piece. This script instead
  classifies every second of every stretch (a one-second grid). Every record carries a whole second, so the grid is
  exact, and a second method that agrees is a real check of the first.
- The consultant's figures are read from its metrics file, or typed in below with their section in the .md, only
  to compare at the end.

Data
- Section 1 of analysis/baseline.py (the 26 Nov 2026 18:59 pull). Only that data block is executed.
- The money-record entry times that analysis/cash-and-capital.py added (26 Nov 19:18 read). Its own constants are
  executed from its source, not re-typed.
- Customer-payment seconds (the data block has minutes): read-only SELECT inside begin ... rollback, 27 Nov 2026
  15:20:47 Manila. That check also found nothing new since 26 Nov 11:16:44 (52 sales, 36 payments, 81 stock
  movements, 3 supplier payments, 5 reserve decisions, 1 payout, 2 expenses, 0 capital entries, tax rate 0),
  no stock movement with a zero change, no inactive product, and that each sale's stock movement carries the
  sale's exact second. The batch, supplier-payment, reserve, payout and expense times matched the ones used here.

Privacy: no buyer names or buyer numbers are used. Centavos in the data, pesos in the output, Manila local time.
Writes nothing.
"""
import argparse
import contextlib
import io
import json
import os
from collections import defaultdict

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description="Independent check of the empty-shelf cause split")
ap.add_argument("--now", default="2026-11-27 12:04:45", help="Manila time the open stretch is measured to")
ap.add_argument("--no-mc", action="store_true", help="skip the cash Monte Carlo re-runs")
args = ap.parse_args()


def run_source(fname, start=None, end=None, ns=None):
    """Execute part of another analysis file (a data block) and return its names."""
    text = open(os.path.join(HERE, fname), encoding="utf-8").read()
    a = text.index(start) if start else 0
    b = text.index(end) if end else len(text)
    ns = {"__file__": os.path.join(HERE, fname), "__name__": "check"} if ns is None else ns
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(text[a:b], f"{fname} [part]", "exec"), ns)
    return ns


D = run_source("baseline.py", end="# 2. FRAMES")
CC = run_source("cash-and-capital.py", "# ---- money-record entry times", "# ---- inputs from other workstreams", ns={})
CONS = json.load(open(os.path.join(HERE, "empty-shelf-causes_metrics.json"), encoding="utf-8"))

P = 100.0
DAY = 86400


def sec(x):
    """Manila wall-clock time -> whole seconds (a plain count; Manila has no daylight saving)."""
    return int(pd.Timestamp(x).value // 10**9)


def tm(s):
    return pd.Timestamp(int(round(s)) * 10**9).strftime("%a %d %b %H:%M:%S")


def iso(s):
    return pd.Timestamp(int(round(s)) * 10**9).strftime("%Y-%m-%d %H:%M:%S")


def ps(c):
    return f"₱{c / P:,.0f}"


def h(t):
    print(f"\n=== {t} ===")


NOW = sec(args.now)
NOV1, DEC1 = sec("2026-11-01"), sec("2026-12-01")
CHECKS = []          # (what, consultant, mine, ok)


def check(what, theirs, mine, tol=0.0, fmt="{:,.4f}"):
    if isinstance(theirs, str) or isinstance(mine, str):
        ok = str(theirs) == str(mine)
        t_, m_ = str(theirs), str(mine)
    else:
        ok = abs(float(theirs) - float(mine)) <= tol
        t_, m_ = fmt.format(theirs), fmt.format(mine)
    CHECKS.append((what, t_, m_, ok))
    return ok


def cons(key):
    return CONS[key]["value"]


# ---------------------------------------------------------------------------------------------
# 0. LIVE READ-ONLY CHECK, 27 Nov 2026 15:20:47 Manila: customer payments to the second (amount, business day)
# ---------------------------------------------------------------------------------------------
LIVE_PAYMENTS = [
    ("2026-11-03 19:33:23", 32000, "2026-11-03"), ("2026-11-04 13:41:59", 32000, "2026-11-04"),
    ("2026-11-04 13:42:10", 32000, "2026-11-04"), ("2026-11-04 13:42:17", 32000, "2026-11-04"),
    ("2026-11-04 20:28:27", 50000, "2026-11-04"), ("2026-11-05 11:20:19", 14000, "2026-11-05"),
    ("2026-11-05 20:24:12", 32000, "2026-11-05"), ("2026-11-06 18:32:08", 32000, "2026-11-06"),
    ("2026-11-06 18:36:33", 32000, "2026-11-06"), ("2026-11-08 18:55:43", 32000, "2026-11-08"),
    ("2026-11-09 17:56:58", 32000, "2026-11-09"), ("2026-11-09 17:58:26", 32000, "2026-11-09"),
    ("2026-11-09 19:48:22", 64000, "2026-11-09"), ("2026-11-09 19:48:29", 32000, "2026-11-09"),
    ("2026-11-09 19:48:34", 32000, "2026-11-09"), ("2026-11-09 19:48:40", 32000, "2026-11-09"),
    ("2026-11-10 18:44:01", 32000, "2026-11-10"), ("2026-11-12 13:46:01", 32000, "2026-11-12"),
    ("2026-11-17 12:45:23", 34000, "2026-11-17"), ("2026-11-17 21:14:43", 40000, "2026-11-17"),
    ("2026-11-18 22:46:39", 34000, "2026-11-18"), ("2026-11-19 08:46:02", 34000, "2026-11-19"),
    ("2026-11-19 08:46:15", 34000, "2026-11-19"), ("2026-11-19 12:11:11", 34000, "2026-11-19"),
    ("2026-11-19 12:39:59", 68000, "2026-11-19"), ("2026-11-19 18:13:39", 34000, "2026-11-19"),
    ("2026-11-20 20:17:19", 34000, "2026-11-20"), ("2026-11-21 20:14:25", 34000, "2026-11-21"),
    ("2026-11-21 20:14:33", 34000, "2026-11-21"), ("2026-11-22 22:03:49", 34000, "2026-11-22"),
    ("2026-11-23 12:55:33", 30000, "2026-11-23"), ("2026-11-23 18:51:14", 34000, "2026-11-23"),
    ("2026-11-24 11:49:24", 34000, "2026-11-24"), ("2026-11-24 17:27:05", 34000, "2026-11-24"),
    ("2026-11-24 17:27:12", 24000, "2026-11-24"), ("2026-11-26 11:16:44", 34000, "2026-11-26"),
]
# the seconds must agree with the data block's minutes, amounts and business days, payment for payment
blk = sorted((t, a, d) for _, a, d, t in D["PAYMENTS"])
liv = sorted((t[:16], a, d) for t, a, d in LIVE_PAYMENTS)
assert blk == liv, "live payment seconds don't match the data block"

# ---------------------------------------------------------------------------------------------
# 1. THE SHELF BY THE CLOCK, rebuilt from the 81 stock movements
# ---------------------------------------------------------------------------------------------
h("1. The shelf by the clock (81 stock movements)")
PROD = D["PRODUCTS"]
BATCH_NO = {k: v[0] for k, v in D["BATCHES"].items()}
mv = pd.DataFrame(D["MOVES"], columns=["pid", "kind", "delta", "bid", "t"])
mv["s"] = mv.t.map(sec)
mv["i"] = np.arange(len(mv))


def shelf_steps(pids=None):
    """Distinct movement seconds and the number of flavours on the shelf after each (only `pids` if given)."""
    level = defaultdict(int)
    T, N = [], []
    m = mv if pids is None else mv[mv.pid.isin(pids)]
    for s_, g in m.sort_values(["s", "i"]).groupby("s", sort=True):
        for r in g.itertuples():
            level[r.pid] += r.delta
        T.append(s_)
        N.append(sum(1 for v in level.values() if v > 0))
    return np.array(T), np.array(N)


T, N = shelf_steps()


def intervals(T, N, end):
    """(start, end, flavours) pieces of the shelf from the first movement to `end`."""
    e = list(T[1:]) + [end]
    return [(a, b, n) for a, b, n in zip(T, e, N) if b > a]


def gaps_of(iv):
    """Maximal stretches with no flavour on the shelf (consecutive empty pieces merged)."""
    out = []
    for a, b, n in iv:
        if n == 0:
            if out and out[-1][1] == a:
                out[-1] = (out[-1][0], b)
            else:
                out.append((a, b))
    return out


IV = intervals(T, N, NOW)
GAPS = gaps_of(IV)
assert len(GAPS) == 2
(S1, A1), (S2, E2) = GAPS
assert E2 == NOW
end_mv = mv[mv.s == A1]
assert set(end_mv.kind) == {"restock"} and set(end_mv.bid.map(BATCH_NO)) == {2}
last1 = mv[(mv.s == S1)]
last2 = mv[(mv.s == S2)]
print(f"stretch 1: {tm(S1)} (last piece: a {last1.kind.iloc[0]}) -> {tm(A1)} (first restock of Batch "
      f"{BATCH_NO[end_mv.bid.iloc[0]]}) = {(A1 - S1) / DAY:.5f} d")
print(f"stretch 2: {tm(S2)} (last piece: a {last2.kind.iloc[0]}) -> now {tm(NOW)} = {(NOW - S2) / DAY:.5f} d, "
      f"still empty (Batch 3 on the way)")
check("stretch 1 days", cons("stretch1_days"), (A1 - S1) / DAY, 5e-5)
check("stretch 2 days so far", cons("stretch2_days_so_far"), (NOW - S2) / DAY, 5e-5)
check("stretch 1 starts (sell-out of Batch 1)", "2026-11-06 18:31:43", iso(S1))
check("stretch 1 ends (Batch 2's first restock)", "2026-11-09 19:55:50", iso(A1))
check("stretch 2 starts (sell-out of Batch 2)", "2026-11-26 11:16:21", iso(S2))


def time_with(lo, hi, cond, iv=None):
    iv = IV if iv is None else iv
    return sum(max(0, min(b, hi) - max(a, lo)) for a, b, n in iv if cond(n)) / DAY


# ---------------------------------------------------------------------------------------------
# 2. WHAT AN EMPTY DAY IS WORTH (the scorecard's own value, rebuilt)
# ---------------------------------------------------------------------------------------------
h("2. What an empty day is worth")
sales = pd.DataFrame(D["SALES"], columns=["sid", "bd", "t", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales = sales.drop(columns="bk")                        # buyer numbers are not used anywhere in this check
items = pd.DataFrame(D["ITEMS"], columns=["sid", "pid", "q", "up", "uc", "ltot"])
done = sales[sales.status == "completed"].copy()


def sale_second(r):
    pids = set(items.loc[items.sid == r.sid, "pid"])
    m = mv[(mv.kind == "sale") & mv.pid.isin(pids) & (mv.t.str[:16] == r.t)]
    assert m.s.nunique() == 1, r.sid
    return int(m.s.iloc[0])


done["s"] = done.apply(sale_second, axis=1)
done["pcs"] = done.sid.map(items.groupby("sid").q.sum())
assert (done.bd == done.t.str[:10]).all()          # every sale was entered on its own business day
FIN = D["FIN_END"]
pieces = int(done.pcs.sum())
# landed cost rebuilt: unit cost + the batch's fees / 30 pieces, for every piece sold
fees = {BATCH_NO[k]: sum(v[3:]) for k, v in D["BATCHES"].items()}
line_batch = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
it = items[items.sid.isin(done.sid)]
landed = sum(r.q * (PROD[r.pid][3] + fees[line_batch[PROD[r.pid][0]]] / 30) for r in it.itertuples())
assert round(landed) == FIN["cogs"] and done.tot.sum() == FIN["net"]
GP = (FIN["net"] - FIN["cogs"]) / P / pieces
first_day = sec(min(done.bd.min(), mv.t.min()[:10]))
today0 = sec(pd.Timestamp(NOW * 10**9).normalize())
rs, re_ = max(today0 - 89 * DAY, first_day), min(today0 + DAY, NOW)


def shelf_before(s):
    """Flavours on the shelf just before second s (the scorecard joins a sale to the piece that ends at it)."""
    i = np.searchsorted(T, s, "left") - 1
    return N[i]


done["n_before"] = done.s.map(shelf_before)
win = done[(done.s >= rs) & (done.s < re_)]
open_days = time_with(rs, re_, lambda n: n > 0)
full_days = time_with(rs, re_, lambda n: n >= 7)
OPEN_RATE = win.pcs.sum() / open_days
FULL_RATE = win[win.n_before >= 7].pcs.sum() / full_days
DAYV, FULLV = OPEN_RATE * GP, FULL_RATE * GP
print(f"{win.pcs.sum()} pieces / {open_days:.4f} days with stock = {OPEN_RATE:.4f} a day; full shelf "
      f"{win[win.n_before >= 7].pcs.sum()} / {full_days:.4f} = {FULL_RATE:.4f} a day; landed gross profit "
      f"{GP:.2f} a piece (rebuilt: {landed / P:,.0f} of landed cost = Finance's)")
print(f"=> {DAYV:.4f} a day with nothing to sell; {FULLV:.4f} a full-shelf day; {DAYV / 24:.3f} an hour")
check("cost per empty day (PHP)", cons("cost_per_empty_day"), DAYV, 1e-3)
check("full-shelf day (PHP)", cons("profit_per_full_day"), FULLV, 1e-3)
check("pace with stock", cons("pace_with_stock"), OPEN_RATE, 1e-4)
check("full-shelf pace", cons("pace_full_shelf"), FULL_RATE, 1e-4)
check("gross profit a piece", cons("gp_per_piece"), GP, 1e-6)


def scorecard(now, cs=NOV1):
    """low / high / empty-now of the month to `now`, as ops.v3 defines them (same rate as at 12:04:45: no sale since)."""
    iv = intervals(T, N, now)
    empty = time_with(cs, now, lambda n: n == 0, iv)
    short = time_with(cs, now, lambda n: n < 7, iv)
    short_pcs = done[(done.s >= cs) & (done.s < now) & (done.n_before < 7)].pcs.sum()
    low = empty * OPEN_RATE
    high = max(short * FULL_RATE - short_pcs, low)
    g = gaps_of(iv)
    since = g[-1][0] if g and g[-1][1] == now else None
    return dict(empty=empty, short=short, short_pcs=short_pcs, low=low * GP, high=high * GP,
                now_cost=(now - since) / DAY * DAYV if since else 0.0)


SC = scorecard(NOW)
SC10 = scorecard(sec("2026-11-27 10:01:30"))
print(f"November to {tm(NOW)}: empty {SC['empty']:.4f} d -> at least {SC['low']:,.2f}; not full {SC['short']:.4f} d, "
      f"{SC['short_pcs']} pieces sold then -> at most {SC['high']:,.2f}")
print(f"the brief's reading at Fri 27 Nov 10:01:30: at least {SC10['low']:,.2f}, at most {SC10['high']:,.2f}, "
      f"empty now {SC10['now_cost']:,.2f}  (the brief: 1,418 / 8,226 / 336)")
check("November at least (PHP)", cons("nov_lost_profit_low"), SC["low"], 0.01)
check("November at most (PHP)", cons("nov_lost_profit_high"), SC["high"], 0.01)
check("brief's reading, at least, rounded", 1418, round(SC10["low"]), 0, "{:,.0f}")
check("brief's reading, at most, rounded", 8226, round(SC10["high"]), 0, "{:,.0f}")
check("brief's reading, empty now, rounded", 336, round(SC10["now_cost"]), 0, "{:,.0f}")
# was the 10:01 figure really the brief's "10:44" check? at 10:44 the low figure would be:
SC1044 = scorecard(sec("2026-11-27 10:44:00"))
print(f"(at 10:44 the at-least figure would have been {SC1044['low']:,.1f}; the brief's 1,418 fits 10:00-10:03 only)")

# ---------------------------------------------------------------------------------------------
# 3. THE COMPANY FUND BY THE SECOND, and what buyers owed
# ---------------------------------------------------------------------------------------------
h("3. The company fund by the second (cash sales + collections - company supplier payments - expenses - payouts)")
ARR = {2: A1, 1: int(mv[mv.bid.map(BATCH_NO) == 1].s.min())}
PAY_AT = {n: (sec(ent), c, pd_, src) for ent, pd_, c, src, n in CC["BATCH_PAY_AT"]}


def pay_event(n, convention="arrival"):
    """When a supplier payment left the fund. Finance counts it on its paid_on day. Within that day: when entered,
    no later than the day's end; a payment dated the arrival day but entered later counts at the arrival second
    ('arrival') or at the day's end ('day_end')."""
    ent, c, pd_, src = PAY_AT[n]
    t = min(ent, sec(pd_) + DAY - 1)
    if convention == "arrival" and n in ARR and pd.Timestamp(ARR[n] * 10**9).strftime("%Y-%m-%d") == pd_ and ent > ARR[n]:
        t = min(t, ARR[n])
    return t


def fund_events(b2_convention="arrival"):
    ev = [(int(r.s), int(r.tot)) for r in done[done.pm != "unpaid"].itertuples()]
    ev += [(sec(t), a) for t, a, d in LIVE_PAYMENTS]
    ev += [(pay_event(n, b2_convention if n == 2 else "arrival"), -c) for n, (ent, c, pd_, src) in PAY_AT.items() if src == "company"]
    ev += [(min(sec(ent), sec(d) + DAY - 1), -c) for ent, d, c in CC["EXPENSE_AT"]]
    ev += [(min(sec(ent), sec(t[:10]) + DAY - 1), -a) for t, a, _, _ in CC["RELEASE_AT"] for ent in [t]]
    assert D["CAPITAL_CONTRIBUTIONS"] == []
    ev.sort()
    return np.array([t for t, _ in ev]), np.cumsum([c for _, c in ev])


FT, FC = fund_events()
FT_alt, FC_alt = fund_events("day_end")


def scalar(r):
    return r.item() if np.ndim(r) == 0 else r


def fund(x, ft=None, fc=None):
    ft = FT if ft is None else ft
    fc = FC if fc is None else fc
    i = np.searchsorted(ft, np.asarray(x), "right") - 1
    return scalar(np.where(i >= 0, fc[np.maximum(i, 0)], 0))


credit = done[done.pm == "unpaid"]
CR_T, CR_C = np.sort(credit.s.values), np.cumsum(credit.sort_values("s").tot.values)
PY_T = np.array([sec(t) for t, _, _ in LIVE_PAYMENTS])
PY_C = np.cumsum([a for _, a, _ in LIVE_PAYMENTS])


def owed_by_buyers(x):
    i = np.searchsorted(CR_T, x, "right") - 1
    j = np.searchsorted(PY_T, x, "right") - 1
    return (CR_C[i] if i >= 0 else 0) - (PY_C[j] if j >= 0 else 0)


# compare with the cash branch's day-by-day ledger (business days, as Finance counts them)
CCF = run_source("cash-and-capital.py", end="# 2. What the app showed at each moment")
led = CCF["led"]
worst = max(abs(fund(sec(d) + DAY - 1) - c) for d, c in zip(led.index, led.cash))
print(f"end-of-day fund vs analysis/cash-and-capital.py's ledger, 27 Oct-26 Nov: largest difference {worst / P:,.2f}")
assert worst == 0
assert round(fund(NOW)) == FIN["cash"]
moments = [("6 Nov 18:31:43, shelf empties", "2026-11-06 18:31:43", 512000),
           ("6 Nov 18:32:08", "2026-11-06 18:32:08", 544000),
           ("9 Nov 19:55:49, just before Batch 2", "2026-11-09 19:55:49", 768000),
           ("13 Nov 08:37:44, reserve set to 7,194", "2026-11-13 08:37:44", 380600),
           ("19 Nov 11:16:21", "2026-11-19 11:16:21", 692600),
           ("19 Nov 12:11:11", "2026-11-19 12:11:11", 726600),
           ("end of 24 Nov", "2026-11-24 23:59:59", 1144600),
           ("25 Nov 07:34:58, Batch 3 paid", "2026-11-25 07:34:58", 423200),
           ("25 Nov 07:48:29, after the payout", "2026-11-25 07:48:29", 0),
           ("26 Nov 11:16:44", "2026-11-26 11:16:44", 34000)]
for lab, t, theirs in moments:
    mine = int(fund(sec(t)))
    print(f"  fund at {lab:40s} {ps(mine):>8s}   owed by buyers {ps(owed_by_buyers(sec(t))):>7s}")
    check(f"fund at {lab}", theirs / P, mine / P, 0, "{:,.0f}")
for lab, t, theirs in [("owed by buyers at 6 Nov 18:31:43", "2026-11-06 18:31:43", 4480),
                       ("owed by buyers at 19 Nov 11:16:21", "2026-11-19 11:16:21", 5000),
                       ("owed by buyers at 16 Nov 11:16:21", "2026-11-16 11:16:21", 5060)]:
    check(lab, theirs, owed_by_buyers(sec(t)) / P, 0, "{:,.0f}")
# the fund's lowest point inside the windows the rules look at
w1 = FT[(FT >= S1) & (FT < A1)]
print(f"  between 6 Nov 18:32:08 and Batch 2 the fund never fell below {ps(min(fund(t) for t in w1 if t >= sec('2026-11-06 18:32:08')))}"
      f" (the ₱640 expense at 17:59:20 on 9 Nov took it to ₱6,080)")


def tax_payable(x, bp=D["SETTINGS"]["tax_rate_bp"]):
    i = np.searchsorted(np.sort(done.s.values), x, "right")
    return scalar(np.round(np.cumsum(np.r_[0, done.sort_values("s").tot.values])[i] * bp / 10000))


BCOST = {n: c for n, c in CC["BATCH_COST_CENTS"].items()}
assert BCOST == {1: 503900, 2: 519400, 3: 721400}
assert BCOST[3] == sum(q * c for _, q, c in D["ORDER_LINES_B3"]) + fees[3]
BOOKED = {1: ARR[1], 2: ARR[2], 3: sec("2026-11-25 07:34:58")}    # order moment if recorded, else the arrival


def owed_other(x, exclude):
    x = np.asarray(x)
    tot = np.zeros(x.shape)
    for n in (1, 2, 3):
        if n == exclude:
            continue
        paid, pt = PAY_AT[n][1], pay_event(n)          # each batch has one supplier payment
        tot += np.where(x >= BOOKED[n], np.maximum(0, BCOST[n] - np.where(x >= pt, paid, 0)), 0)
    return scalar(tot)


def avail(x, exclude):
    return fund(x) - tax_payable(x) - owed_other(x, exclude)


for x in (S1, A1 - 1, sec("2026-11-19 11:16:21"), sec("2026-11-25 07:34:57")):
    assert owed_other(x, 2) == 0 and owed_other(x, 3) == 0 and tax_payable(x) == 0
print("owed to suppliers on other batches and tax payable: ₱0 at every moment the rules look at (tax rate 0%)")

# ---------------------------------------------------------------------------------------------
# 4. PAYMENT TERMS OF EACH BATCH, from the supplier-payment records
# ---------------------------------------------------------------------------------------------
h("4. Payment terms, from the records")
TERMS = {}
for n in (1, 2, 3):
    ent, c, pd_, src = PAY_AT[n]
    owners = c if src != "company" else 0
    due = BCOST[n] - owners
    at = pay_event(n)
    ahead = c if (src == "company" and (n not in ARR or at < ARR[n])) else 0
    ahead_at = at if ahead else None
    label = "owner-paid" if due == 0 else ("at order" if ahead >= due else ("on pick-up" if ahead == 0 else "part"))
    TERMS[n] = dict(due=due, ahead=ahead, ahead_at=ahead_at, pickup=max(0, due - ahead), label=label)
    print(f"Batch {n}: cost {ps(BCOST[n])}, company due {ps(due)}, paid {ps(c)} from {src} dated {pd_} (entered "
          f"{tm(ent)}), counts at {tm(at)}; arrived {tm(ARR[n]) if n in ARR else 'not yet'} -> {label}")
assert TERMS[2]["label"] == "on pick-up" and TERMS[3]["label"] == "at order" and TERMS[1]["label"] == "owner-paid"

# ---------------------------------------------------------------------------------------------
# 5. THE CAUSE RULES, second by second (my own implementation of the scorecard spec, section B)
# ---------------------------------------------------------------------------------------------
CAUSES = ["choice", "money", "unrecorded", "late_order", "supplier"]


class Case:
    """One empty stretch and what the rules need to know about it. Times in whole seconds."""

    def __init__(self, S, E, L_days, order_at, ahead, ahead_at, pickup, closed, has_batch, avail_fn, label=""):
        self.S, self.E, self.L = S, E, int(round(L_days * DAY))
        self.order_at, self.ahead, self.ahead_at, self.pickup = order_at, ahead, ahead_at, pickup
        self.closed, self.has_batch, self.avail, self.label = closed, has_batch, avail_fn, label

    def causes_at(self, m):
        """Cause of each moment in m (seconds, may be fractional), first rule that applies."""
        m = np.asarray(m, dtype=float)
        tau = m - self.L
        stop = next((x for x in (self.ahead_at, self.order_at) if x is not None), np.inf)
        money = np.zeros(m.shape, bool)
        if self.ahead > 0:
            money |= (tau < stop) & (self.avail(tau) < self.ahead)
        if self.pickup > 0:
            money |= self.avail(m) < self.pickup
        late = np.ones(m.shape, bool) if self.order_at is None else (tau < self.order_at)
        out = np.where(late, "late_order", "supplier").astype(object)
        if self.has_batch and self.order_at is None and self.closed:
            out[:] = "unrecorded"
        out[money] = "money"
        return out

    def grid(self, lo=None, hi=None):
        """Seconds by cause: every one-second cell [t, t+1) classified at its middle."""
        lo = self.S if lo is None else max(lo, self.S)
        hi = self.E if hi is None else min(hi, self.E)
        out = {c: 0.0 for c in CAUSES}
        if hi <= lo:
            return out
        c = self.causes_at(np.arange(lo, hi) + 0.5)
        u, k = np.unique(c, return_counts=True)
        for a, b in zip(u, k):
            out[a] = b / DAY
        return out

    def runs(self):
        c = self.causes_at(np.arange(self.S, self.E) + 0.5)
        cut = np.flatnonzero(c[1:] != c[:-1]) + 1
        starts = np.r_[0, cut]
        ends = np.r_[cut, len(c)]
        return [(self.S + a, self.S + b, c[a]) for a, b in zip(starts, ends)]


def lead_days(exclude, gap_start):
    """Usual delivery: (recorded order-to-arrival days of up to 10 other batches + 7) / (n + 1)."""
    rec = [(b[2], b[1]) for k, b in D["BATCHES"].items() if b[1] and b[2] and BATCH_NO[k] != exclude and sec(b[2]) <= gap_start]
    gapsd = [(sec(r) - sec(o)) / DAY for r, o in sorted(rec)][-10:]
    return (sum(gapsd) + 7) / (len(gapsd) + 1), len(gapsd)


L1, n1 = lead_days(2, S1)
L3, n3 = lead_days(3, S2)
assert L1 == 7 and L3 == 7 and n1 == n3 == 0
O3 = sec("2026-11-25 07:34:58")                     # entered on its order day: the order moment is the entry


def case1(L=7.0, terms="as recorded", end=None):
    t = TERMS[2]
    if terms == "as recorded":
        return Case(S1, A1 if end is None else end, L, None, t["ahead"], t["ahead_at"], t["pickup"], True, True,
                    lambda x: avail(x, 2), "stretch 1")
    # what-if: paid in full at order (order moment unknown, so no cut-off)
    return Case(S1, A1, L, None, t["due"], None, 0, True, True, lambda x: avail(x, 2), "stretch 1 at order")


def case2(L=7.0, terms="as recorded", end=None):
    t = TERMS[3]
    end = O3 + int(round(L * DAY)) if end is None else end
    if terms == "as recorded":
        return Case(S2, end, L, O3, t["ahead"], t["ahead_at"], t["pickup"], False, True, lambda x: avail(x, 3), "stretch 2")
    # what-if: on pick-up. The 7,214 stays in the fund (see section 9 for whether the 25 Nov payout still fitted)
    return Case(S2, end, L, O3, 0, None, t["due"], False, True,
                lambda x: avail(x, 3) + np.where(np.asarray(x) >= O3, t["due"], 0), "stretch 2 on pick-up")


h("5. The split of each stretch, second by second (usual delivery 7 days: no batch has both dates)")
c1 = case1()
c2now = case2(end=NOW)
c2exp = case2()
p1, p2n, p2e = c1.grid(), c2now.grid(), c2exp.grid()
for lab, c in (("stretch 1", c1), ("stretch 2 to the expected arrival", c2exp)):
    print(f"{lab}:")
    for a, b, k in c.runs():
        print(f"   {tm(a)} -> {tm(b)}  {(b - a) / DAY:9.5f} d  {k}")
for lab, p, tot in (("stretch 1", p1, (A1 - S1) / DAY), ("stretch 2 so far", p2n, (NOW - S2) / DAY),
                    ("stretch 2 to 2 Dec 07:34:58", p2e, (c2exp.E - S2) / DAY)):
    assert abs(sum(p.values()) - tot) < 1e-12
    print(f"{lab:28s} {tot:.5f} d = " + " + ".join(f"{k} {v:.5f} d (₱{v * DAYV:,.2f})" for k, v in p.items() if v))
check("stretch 1: waiting for money (seconds)", cons("stretch1_money_seconds"), p1["money"] * DAY, 1e-6, "{:,.0f}")
check("stretch 1: not recorded (days)", cons("stretch1_unrecorded_days"), p1["unrecorded"], 5e-5)
for k in CAUSES:
    check(f"stretch 2 so far: {k} (days)", cons(f"stretch2_so_far_{k}_days"), p2n[k], 5e-5)
    check(f"stretch 2 to arrival: {k} (days)", cons(f"stretch2_to_arrival_{k}_days"), p2e[k], 5e-5)
check("expected arrival of Batch 3", "Wed 02 Dec 07:34:58", tm(c2exp.E))
# the same with Batch 2's payment counted at the end of 9 Nov (Finance's day) instead of at the arrival second
alt = Case(S1, A1, 7, None, 0, None, TERMS[2]["pickup"], True, True,
           lambda x: fund(x, FT_alt, FC_alt) - owed_other(x, 2), "alt").grid()
assert alt == p1
print("counting Batch 2's payment at the end of 9 Nov instead of at the arrival second changes nothing")

# ---------------------------------------------------------------------------------------------
# 6. NOVEMBER: the parts add up, and the whole pesos
# ---------------------------------------------------------------------------------------------
h("6. November to now: the parts, the total, and the whole pesos shown")
nov = {k: c1.grid(NOV1, NOW)[k] + c2now.grid(NOV1, NOW)[k] for k in CAUSES}
assert abs(sum(nov.values()) - SC["empty"]) < 1e-12, "parts must add up to the empty time"
assert abs(sum(nov.values()) * DAYV - SC["low"]) < 1e-9, "and, at one rate, to the at-least figure"


def largest_remainder(parts):
    total = round(sum(parts.values()))
    fl = {k: int(np.floor(v)) for k, v in parts.items()}
    extra = total - sum(fl.values())
    for k in sorted(parts, key=lambda k: (-(parts[k] - fl[k]), k))[:extra]:
        fl[k] += 1
    return total, fl


tot_nov, shown_nov = largest_remainder({k: v * DAYV for k, v in nov.items()})
for k in CAUSES:
    print(f"  {k:11s} {nov[k]:8.5f} d  {nov[k] * DAYV:9.2f}  shown ₱{shown_nov[k]:,}  {nov[k] / SC['empty']:6.1%}")
    check(f"November {k} (days)", cons(f"nov_{k}_days"), nov[k], 5e-5)
    check(f"November {k}, whole pesos shown", cons(f"shown_november_so_far_{k}"), shown_nov[k], 0, "{:,.0f}")
plan_lo, plan_hi = shown_nov["late_order"], shown_nov["late_order"] + shown_nov["unrecorded"]
known = 1 - nov["unrecorded"] / SC["empty"]
print(f"  total {SC['empty']:.5f} d = ₱{tot_nov:,} (= at least, rounded); plan ₱{plan_lo:,} to ₱{plan_hi:,}; "
      f"known cause {known:.1%}; a planning-only figure = {nov['late_order'] / SC['empty']:.1%} of the total")
check("November total, whole pesos", 1449, tot_nov, 0, "{:,.0f}")
check("plan range, low", 352, plan_lo, 0, "{:,.0f}")
check("plan range, high", 1435, plan_hi, 0, "{:,.0f}")
check("share of empty time with a known cause", cons("nov_known_cause_share"), known, 5e-5)
check("planning-only share", cons("nov_planning_only_share"), nov["late_order"] / SC["empty"], 5e-5)
for lab, p, key in (("stretch 2 so far", p2n, "shown_stretch_2_so_far"), ("stretch 2 to arrival", p2e, "shown_stretch_2_to_expected_arrival")):
    t_, s_ = largest_remainder({k: v * DAYV for k, v in p.items()})
    print(f"  {lab}: ₱{t_:,} = " + " + ".join(f"{k} ₱{v:,}" for k, v in s_.items() if v))
    for k in CAUSES:
        check(f"{lab} {k}, whole pesos", cons(f"{key}_{k}"), s_[k], 0, "{:,.0f}")
# no double counting: each second of each stretch carries one cause, and stretches don't overlap
assert A1 <= S2
# the same rate everywhere: every peso figure above = days x the one cost per empty day
print(f"  every peso figure = days x {DAYV:.4f}; at the full-shelf rate the empty part is "
      f"{SC['empty'] * FULLV:,.2f} = " + " + ".join(f"{k} {v * FULLV:,.2f}" for k, v in nov.items() if v))
check("high estimate, empty part (PHP)", cons("nov_high_empty_part"), SC["empty"] * FULLV, 0.01)
check("high estimate, partly-stocked part (PHP)", cons("nov_high_thin_part"), SC["high"] - SC["empty"] * FULLV, 0.01)
# within November if Batch 3 comes as expected (2 Dec 07:34:58)
nov_end = {k: c1.grid(NOV1, DEC1)[k] + c2exp.grid(NOV1, DEC1)[k] for k in CAUSES}
check("November to 30 Nov 24:00, total (PHP)", cons("nov_to_month_end_cost"), sum(nov_end.values()) * DAYV, 0.01)
check("November to 30 Nov 24:00, ordered late (PHP)", cons("nov_to_month_end_late_order_cost"), nov_end["late_order"] * DAYV, 0.01)

# ---------------------------------------------------------------------------------------------
# 7. SENSITIVITY: delivery time and payment terms
# ---------------------------------------------------------------------------------------------
h("7. Sensitivity: usual delivery 5 / 7 / 10 days x payment terms")
for L in (5, 7, 10):
    for terms in ("as recorded", "other"):
        a = case1(L, terms).grid()
        b_full = case2(L, terms).grid()
        b_now = case2(L, terms, end=min(NOW, O3 + L * DAY)).grid()
        k1 = "on_pickup" if terms == "as recorded" else "at_order"
        k2 = "at_order" if terms == "as recorded" else "on_pickup"
        for k in CAUSES:
            check(f"sens stretch 1, L {L}, {k1}: {k}", cons(f"sens_s1_L{L}_{k1}_{k}_days"), a[k], 5e-5)
            check(f"sens stretch 2, L {L}, {k2}: {k}", cons(f"sens_s2_L{L}_{k2}_{k}_days"), b_full[k], 5e-5)
        tb, sb = largest_remainder({k: v * DAYV for k, v in b_full.items()})
        tn, sn_ = largest_remainder({k: v * DAYV for k, v in b_now.items()})
        print(f"L {L:2d} {terms:11s}| stretch 1: " + ", ".join(f"{k} {v:.4f} d" for k, v in a.items() if v)
              + f" | stretch 2 to arrival ₱{tb:,}: " + ", ".join(f"{k} ₱{v:,}" for k, v in sb.items() if v)
              + f" | so far ₱{tn:,}: " + ", ".join(f"{k} ₱{v:,}" for k, v in sn_.items() if v))
# where the late part stops depending on the delivery time
M3 = sec("2026-11-19 12:11:11")
for L in (6.0, 6.95, 6.97, 8.0, 12.0):
    p = case2(L).grid()
    print(f"  L {L:5.2f}: ordered late {p['late_order']:.4f} d, money {p['money']:.4f} d "
          f"(formula: late = {min(L - (S2 - O3) / DAY, (O3 - M3) / DAY):.4f})")
print(f"  breakpoint L = sell-out - money enough = {(S2 - M3) / DAY:.4f} d; order - money enough = {(O3 - M3) / DAY:.4f} d; "
      f"sell-out - order = {(S2 - O3) / DAY:.4f} d")
# the usual delivery at the owner's own 5 days (docs/HISTORY.md: a 12-14 Nov order 'arrives 17-19 Nov') while Batch 3
# comes on 2 Dec 07:34:58 (order + 7): the last 2 days become the supplier's
p5 = case2(5, end=O3 + 7 * DAY).grid()
t5, s5 = largest_remainder({k: v * DAYV for k, v in p5.items()})
print(f"  usual delivery 5 days but Batch 3 comes 2 Dec 07:34:58: " + ", ".join(f"{k} {v:.4f} d" for k, v in p5.items() if v)
      + f" = ₱{t5:,}: " + ", ".join(f"{k} ₱{v:,}" for k, v in s5.items() if v))
# the order of the waterfall: planning tested before money
for L in (7, 10):
    c = case2(L)
    m = np.arange(c.S, c.E) + 0.5
    tau = m - c.L
    late = tau < c.order_at
    print(f"  planning tested first, L {L}: money would be {np.sum(~late & (c.causes_at(m) == 'money')) / DAY:.4f} d "
          f"(it is {c.grid()['money']:.4f} d tested first)")

# ---------------------------------------------------------------------------------------------
# 8. THE ORDER-BY DATES, AND THE MONEY ON EACH
# ---------------------------------------------------------------------------------------------
h("8. Should-have-ordered-by dates for Batch 3, and the money")
stock = mv.sort_values(["s", "i"]).groupby("s").delta.sum().cumsum()


def stock_at(x):
    s = stock[stock.index <= x]
    return int(s.iloc[-1]) if len(s) else 0


b2_full = int(mv[mv.bid.map(BATCH_NO) == 2].s.max())
rop_t = int(stock[(stock.index > b2_full) & (stock < 22.6)].index.min())
print(f"reorder point 22.6 pieces first crossed {tm(rop_t)}: {30 - stock_at(rop_t)} of Batch 2's 30 sold; "
      f"fund {ps(fund(rop_t))}; Batch 3 went in {(O3 - rop_t) / DAY:.2f} d later")
check("reorder-point date, days before the order", cons("b3_days_late_vs_engine_rop"), (O3 - rop_t) / DAY, 5e-5)
check("fund at the reorder-point date", cons("b3_fund_at_engine_rop"), fund(rop_t) / P, 0)
lot = S2 - 7 * DAY
check("latest on-time moment", cons("batch3_latest_on_time"), iso(lot))
short_at = [t for t in FT if lot - 30 * DAY <= t < O3 and avail(t, 3) < BCOST[3]]
m0 = max(short_at)
nxt = FT[FT > m0].min()
print(f"last fund moment before the order with less than ₱7,214 available: {tm(m0)}; the next fund moment {tm(nxt)}")
print(f"  the spec's sentence ('the next fund moment after m0, or latest_on_time if m0 is before it') gives "
      f"{tm(lot) if m0 < lot else tm(nxt)}; greatest(latest_on_time, next moment) gives {tm(max(lot, nxt))}")
check("money enough at (spec section F)", cons("batch3_money_enough_at"), iso(max(lot, nxt)))
SPEC_LITERAL_MONEY_ENOUGH = lot if m0 < lot else nxt
first_6850 = next(t for t in FT if t >= sec("2026-11-12") and fund(t) >= 685000)
print(f"the projection's ₱6,850 first in the fund {tm(first_6850)} ({(O3 - first_6850) / DAY:.2f} d before the order); "
      f"fund at the start of 12 Nov {ps(fund(sec('2026-11-12') - 1))}, end of 14 Nov {ps(fund(sec('2026-11-15') - 1))}")
check("first moment the fund held 6,850", cons("b3_projection_cost_first_affordable"), iso(first_6850))
check("fund at the start of 12 Nov", cons("b3_fund_at_projection_from"), fund(sec("2026-11-12") - 1) / P, 0)
check("fund at the end of 14 Nov", cons("b3_fund_at_projection_to"), fund(sec("2026-11-15") - 1) / P, 0)
check("stock when Batch 3 was ordered", cons("stock_when_b3_ordered"), stock_at(O3), 0)
# pick-up what-if for the projection's order window: on the app's 7-day guess, and on the projection's own
# delivery (docs/HISTORY.md: "order Batch 3 around 12-14 Nov ... it arrives 17-19 Nov", i.e. 5 days)
print("the projection's order days on pick-up terms (fund on the arrival day against the bill):")
PICKUP = []
for d in ("2026-11-12", "2026-11-13", "2026-11-14"):
    for L in (5, 7):
        arr0, arr1 = sec(d) + L * DAY, sec(d) + L * DAY + DAY - 1
        f0, f1 = fund(arr0 + 12 * 3600), fund(arr1)
        PICKUP.append((d, L, f0, f1))
        print(f"   ordered {d}, {L}-day delivery -> arrives {pd.Timestamp(arr0 * 10**9):%d %b}: fund {ps(fund(arr0))} "
              f"at the day's start, {ps(f0)} at noon, {ps(f1)} at its end; bill ₱6,850 (projection) / ₱7,214 (Batch 3)")

# ---------------------------------------------------------------------------------------------
# 9. THE PICK-UP WHAT-IF FOR BATCH 3: would the 25 Nov payout still have fitted?
# ---------------------------------------------------------------------------------------------
h("9. Batch 3 on pick-up instead: Safe to distribute at 25 Nov 07:48")
t_pay = sec("2026-11-25 07:48:28")
sold = done[done.s <= t_pay]
it_s = items[items.sid.isin(sold.sid)]
cogs_s = sum(r.q * (PROD[r.pid][3] + fees[line_batch[PROD[r.pid][0]]] / 30) for r in it_s.itertuples())
exp_s = sum(c for ent, d, c in CC["EXPENSE_AT"] if sec(ent) <= t_pay)
kept = sold.tot.sum() - cogs_s - exp_s
cash_cf = fund(t_pay) + BCOST[3]
spare_cf = cash_cf - BCOST[3] - 0          # owed to the supplier held back; the reserve was used up by the order
safe_cf = max(0, min(kept, spare_cf))
print(f"profit kept {kept / P:,.2f}; cash without the prepayment {ps(cash_cf)}; spare after holding the unpaid "
      f"{ps(BCOST[3])} {ps(spare_cf)} -> safe to distribute {ps(safe_cf)} (payout ₱4,232); fund now + the bill "
      f"{ps(fund(NOW) + BCOST[3])}")
check("pick-up what-if: safe to distribute at 07:48", cons("pickup_whatif_safe_0748"), safe_cf / P, 0)

# ---------------------------------------------------------------------------------------------
# 10. STRETCH 1: what each delivery time implies
# ---------------------------------------------------------------------------------------------
h("10. Stretch 1: the fund and the stock on the dates each delivery time implies")
for L in (5, 7, 10):
    lo_t, imp = S1 - L * DAY, A1 - L * DAY
    print(f"L {L:2d}: latest on-time {tm(lo_t)} fund {ps(fund(lo_t))} ({fund(lo_t) / BCOST[2]:.0%} of the bill); "
          f"implied order {tm(imp)}, {stock_at(imp)} pieces left, fund then {ps(fund(imp))} ({fund(imp) / BCOST[2]:.0%})")
    check(f"stretch 1, fund on the latest on-time day, L {L}", cons(f"stretch1_cash_on_latest_on_time_day_L{L}"), fund(lo_t) / P, 0)
    check(f"stretch 1, pieces left at the implied order, L {L}", cons(f"stretch1_pieces_left_at_implied_order_L{L}"), stock_at(imp), 0)
def fund_range(lo, hi):
    v = [int(fund(lo))] + [int(fund(t)) for t in FT if lo < t <= hi]
    return min(v), max(v)


w57 = fund_range(A1 - 7 * DAY, A1 - 5 * DAY)
w_lot = fund_range(S1 - 7 * DAY, A1 - 5 * DAY)
print(f"fund 5 to 7 days before the arrival: ₱{min(w57) / P:,.0f} to ₱{max(w57) / P:,.0f}; from the 7-day latest on-time "
      f"day to 5 days before the arrival: ₱{min(w_lot) / P:,.0f} to ₱{max(w_lot) / P:,.0f}")
FIRST_5194 = next(t for t in FT if t >= sec("2026-10-27") and fund(t) >= BCOST[2])
print(f"the fund first held ₱5,194 at {tm(FIRST_5194)}")

# ---------------------------------------------------------------------------------------------
# 11. THIN SHELF (the high estimate)
# ---------------------------------------------------------------------------------------------
h("11. The partly-stocked part of the high estimate")
for lab, lo_t, hi_t, key in (("Batch 1's tail", NOV1, S1, "thin_b1_tail_cost"), ("Batch 2", A1, S2, "thin_b2_cost")):
    tt = time_with(lo_t, hi_t, lambda n: 0 < n < 7)
    pcs = done[(done.s > lo_t) & (done.s <= hi_t) & (done.n_before < 7)].pcs.sum()
    v = (tt * FULL_RATE - pcs) * GP
    print(f"{lab:15s}: {tt:.4f} d with 1-6 flavours, {pcs} pieces sold then, {tt * FULL_RATE:.1f} at the full pace -> {v:,.2f}")
    check(f"thin part, {lab} (PHP)", cons(key), v, 0.01)
fd = {}
for b in (1, 2):
    pids = [p for p, v in PROD.items() if line_batch[v[0]] == b]
    shop_out = S1 if b == 1 else S2
    tot = 0.0
    for p in pids:
        m = mv[mv.pid == p].sort_values(["s", "i"])
        lv = m.delta.cumsum().values
        zero = m.s.values[np.flatnonzero(lv == 0)]
        tot += max(0, shop_out - zero[0]) / DAY if len(zero) else 0
    fd[b] = tot
reord = int(sum(((mv.pid == p) & (mv.kind == "restock") & (mv.s > mv[(mv.pid == p) & (mv.kind == "sale")].s.min())).any()
                for p in PROD))
print(f"flavour-days missing while the shop had stock: Batch 1 {fd[1]:.2f}, Batch 2 {fd[2]:.2f}; flavours restocked "
      f"after selling: {reord}")
# a catch-up after the first gap? sales in the first 1 and 3 days after Batch 2 arrived, against the pace
d1 = done[(done.s >= A1) & (done.s < A1 + DAY)].pcs.sum()
d3 = done[(done.s >= A1) & (done.s < A1 + 3 * DAY)].pcs.sum()
print(f"after the 6-9 Nov gap: {d1} pieces in the first 24 h, {d3} in the first 72 h ({d3 / 3:.2f} a day) against "
      f"{OPEN_RATE:.2f} a day")

# ---------------------------------------------------------------------------------------------
# 12. EDGE CASES: synthetic stretches through the same rules
# ---------------------------------------------------------------------------------------------
h("12. Edge cases (synthetic; days from a day 0; usual delivery 7 days)")


class Fund:
    """A synthetic company fund: step changes (day, pesos); tax on sales (day, pesos) at `bp`; batches owed."""

    def __init__(self, steps, sales=(), bp=0, owed=()):
        self.t = np.array([d * DAY for d, _ in sorted(steps)], float)
        self.c = np.cumsum([v for _, v in sorted(steps)])
        self.st = np.array([d * DAY for d, _ in sorted(sales)], float)
        self.sc = np.cumsum([v for _, v in sorted(sales)]) if sales else np.array([])
        self.bp, self.owed = bp, owed            # owed: (booked day, amount, paid day or None)

    def __call__(self, x):
        x = np.asarray(x, float)
        i = np.searchsorted(self.t, x, "right") - 1
        f = np.where(i >= 0, self.c[np.maximum(i, 0)], 0.0)
        if len(self.st):
            j = np.searchsorted(self.st, x, "right") - 1
            f = f - np.where(j >= 0, np.round(self.sc[np.maximum(j, 0)] * self.bp / 10000, 2), 0.0)
        for bd, amt, pdd in self.owed:
            f = f - np.where((x >= bd * DAY) & ((pdd is None) | (x < (pdd if pdd is not None else 0) * DAY)), amt, 0.0)
        return f


def days_(p):
    return ", ".join(f"{k} {v:g}" for k, v in p.items() if v > 1e-9)


def bp_method(case, events):
    """The consultant's method: cut at S, E, order + L, payment + L and the fund's own events, classify midpoints."""
    cuts = {case.S, case.E}
    if case.order_at is not None:
        cuts.add(case.order_at + case.L)
    if case.ahead_at is not None:
        cuts.add(case.ahead_at + case.L)
    for e in events:
        if case.ahead > 0:
            cuts.add(e + case.L)
        if case.pickup > 0:
            cuts.add(e)
    cuts = sorted(x for x in cuts if case.S <= x <= case.E)
    out = {c: 0.0 for c in CAUSES}
    for a, b in zip(cuts[:-1], cuts[1:]):
        out[case.causes_at(np.array([(a + b) / 2]))[0]] += (b - a) / DAY
    return out


E = []          # (case, rules as specified, what it should be, verdict)

# E1 open stretch, nothing on order: money against the last company-paid batch (5,000), then ordered late
f = Fund([(0, 3000), (5, 2000)])
c = Case(10 * DAY, 15 * DAY, 7, None, 5000, None, 0, False, False, f)
E.append(("E1 open stretch, nothing on order (fund 3,000 then 5,000 from day 5; last company batch 5,000)",
          c.grid(), {"money": 2.0, "late_order": 3.0}, "as intended"))

# E2 closed stretch, ended by a batch with no order day: all 'not recorded' after any money part
f = Fund([(0, 9000)])
c = Case(10 * DAY, 13 * DAY, 7, None, 0, None, 1000, True, True, f)
E.append(("E2 batch with no order day, paid on pick-up, money there", c.grid(), {"unrecorded": 3.0}, "as intended"))

# E3 same, but the batch was paid on day 5 (before it came): the order was certainly in by day 5
c = Case(10 * DAY, 20 * DAY, 7, None, 1000, 5 * DAY, 0, True, True, Fund([(0, 9000), (5, -1000)]))
E.append(("E3 no order day, but paid ahead on day 5; arrives day 20", c.grid(), {"unrecorded": 2.0, "supplier": 8.0},
          "information lost: a payment before arrival proves the order was in, so 8 of the 10 days are the supplier's"))

# E4 pick-up vs at order: fund 2,000 until day 11, then 6,000; bill 5,000; ordered day 12, arrives day 19
c_pu = Case(10 * DAY, 19 * DAY, 7, 12 * DAY, 0, None, 5000, True, True, Fund([(0, 2000), (11, 4000)]))
c_ao = Case(10 * DAY, 19 * DAY, 7, 12 * DAY, 5000, 12 * DAY, 0, True, True, Fund([(0, 2000), (11, 4000), (12, -5000)]))
E.append(("E4a the same order paid on pick-up (bill due on arrival, tested at t)", c_pu.grid(),
          {"money": 1.0, "late_order": 8.0}, "as intended"))
E.append(("E4b paid at order (bill due at tau = t - 7 days)", c_ao.grid(), {"money": 8.0, "late_order": 1.0}, "as intended"))

# E5 ordered 3 days before sell-out, paid at order, delivery took 13 days
c = Case(10 * DAY, 20 * DAY, 7, 7 * DAY, 1000, 7 * DAY, 0, True, True, Fund([(0, 9000), (7, -1000)]))
E.append(("E5 ordered day 7 (before the day-10 sell-out), arrives day 20", c.grid(), {"late_order": 4.0, "supplier": 6.0},
          "as intended"))

# E6 two orders overlapping: X ordered and paid day 1 (due day 8) but late, Y ordered day 12 arrives day 15 and ends
# the gap. The rules look only at Y, the batch that ended the stretch.
c = Case(10 * DAY, 15 * DAY, 7, 12 * DAY, 1000, 12 * DAY, 0, True, True, Fund([(0, 9000), (1, -1000), (12, -1000)]))
E.append(("E6 two orders: X ordered day 1 (due day 8) still on the way, Y ordered day 12 came day 15", c.grid(),
          {"supplier": 5.0}, "WRONG: X was in on time, so the 5 days are the supplier's; the rules say ordered late"))

# E7 part payment: 3,000 at order on day 12 (after the day-10 sell-out) and 3,000 on arrival (day 19). Fund 5,000,
# 2,000 after the first payment, 3,000 from day 16. Ordered on time, the shop pays 3,000 at tau and must find 3,000
# more on arrival, so it is short until day 16.
f = Fund([(0, 5000), (12, -3000), (16, 1000)])
c = Case(10 * DAY, 19 * DAY, 7, 12 * DAY, 3000, 12 * DAY, 3000, True, True, f)
E.append(("E7 part payment (3,000 at order on day 12 + 3,000 on arrival)", c.grid(), {"money": 6.0, "late_order": 3.0},
          "WRONG: the test on arrival counts the 3,000 already promised at order, so days 10-12 show as ordered late"))

# E8 paid at order with the tax rate at 3%: a credit sale on day 4 (tax +300) makes the money short until a
# collection on day 5; neither is in the breakpoint list, so the consultant's method misplaces the cut
f = Fund([(0, 5200), (5, 200)], sales=[(4, 10000)], bp=300)
c = Case(10 * DAY, 19 * DAY, 7, 12 * DAY, 5000, 12 * DAY, 0, True, True, f)
fund_events_e8 = [0, 5 * DAY, 12 * DAY]           # capital, collection, the supplier payment
E.append(("E8 tax 3%, a credit sale moves 'available' between fund events: second by second", c.grid(),
          {"late_order": 8.0, "money": 1.0}, "as intended"))
E.append(("E8 the same with the consultant's breakpoint method", bp_method(c, fund_events_e8),
          {"late_order": 8.0, "money": 1.0}, "WRONG by 1 day: the credit sale (+L) is not a breakpoint"))

# E9 another batch booked unpaid (pick-up terms) on day 4 lowers 'available' with no fund event
f = Fund([(0, 6000)], owed=[(4, 2000, None)])
c = Case(10 * DAY, 19 * DAY, 7, 12 * DAY, 5000, 12 * DAY, 0, True, True, f)
E.append(("E9 another order booked on day 4, unpaid: second by second", c.grid(), {"late_order": 1.0, "money": 8.0},
          "as intended (money short from tau = day 4)"))
E.append(("E9 the same with the consultant's breakpoint method", bp_method(c, [0, 12 * DAY]),
          {"late_order": 1.0, "money": 8.0}, "WRONG: no cut at day 4 + L, so the midpoint decides for the whole piece"))

# E10 order placed day 3, paid day 6 although the money was there (supplier ships on payment), arrives day 13
c = Case(10 * DAY, 13 * DAY, 7, 3 * DAY, 1000, 6 * DAY, 0, True, True, Fund([(0, 9000), (6, -1000)]))
E.append(("E10 ordered day 3, paid day 6 with the money there, arrives day 13 (7 days after paying)", c.grid(),
          {"late_order": 3.0}, "WRONG: the delay was the shop's payment, the rules say supplier"))

for lab, got, want, verdict in E:
    print(f"{lab}\n    rules: {days_(got)}   should be: {days_(want)}   -> {verdict}")

# E11 period boundary: a stretch from 28 Nov 12:00 to 3 Dec 12:00, ordered late until 2 Dec 00:00 then supplier
S_, E_ = sec("2026-11-28 12:00"), sec("2026-12-03 12:00")
c = Case(S_, E_, 7, sec("2026-11-25 00:00"), 0, None, 0, True, True, lambda x: np.full(np.shape(x), 1e9))
pn, pd_ = c.grid(None, DEC1), c.grid(DEC1, None)
pw = c.grid()
assert all(abs(pn[k] + pd_[k] - pw[k]) < 1e-12 for k in CAUSES)
tn_, sn2 = largest_remainder({k: v * DAYV for k, v in pn.items()})
td_, sd2 = largest_remainder({k: v * DAYV for k, v in pd_.items()})
tw_, sw2 = largest_remainder({k: v * DAYV for k, v in pw.items()})
print(f"E11 a stretch across the month end: November {days_(pn)} d + December {days_(pd_)} d = whole {days_(pw)} d "
      f"(exact); whole pesos: Nov ₱{tn_:,} + Dec ₱{td_:,} = ₱{tn_ + td_:,} against ₱{tw_:,} for the whole stretch")

# E12 a void during an empty shelf: sold out day 10, an old sale voided day 12 (+1 piece), sold again day 13; X
# (ordered and paid day 1, due day 8) arrives day 18. The shelf now has two stretches. The first ends with the void,
# so it has no batch, and the spec judges it as 'nothing on order' against the last company batch (X, 1,000).
f12 = Fund([(0, 9000), (1, -1000)])
g1 = Case(10 * DAY, 12 * DAY, 7, None, 1000, None, 0, True, False, f12).grid()
g2 = Case(13 * DAY, 18 * DAY, 7, 1 * DAY, 1000, 1 * DAY, 0, True, True, f12).grid()
E12 = {k: g1[k] + g2[k] for k in CAUSES}
print(f"E12 a void while the shelf is empty (two stretches, the first ended by the void)\n    rules: {days_(E12)}   "
      f"should be: supplier 7   -> WRONG: the first part is judged as 'nothing on order'")

# E13 a product made inactive: ops.v3's shelf keeps only active products, so history changes
T_b, N_b = shelf_steps([p for p, v in PROD.items() if line_batch[v[0]] != 1])
iv_b = intervals(T_b, N_b, NOW)
g_b = gaps_of(iv_b)
print(f"E13 if Batch 1's 10 sold-out flavours were made inactive, the shelf would start {tm(T_b[0])}; stretches with "
      f"nothing on the shelf: " + ", ".join(f"{tm(a)} -> {tm(b)}" for a, b in g_b) + " (the 6-9 Nov stretch disappears)")

# ---------------------------------------------------------------------------------------------
# 13. MATH-CHECK CONSISTENCY: Batch 4 at the adopted PHP 5,664 order, with the cash branch's own simulator
# ---------------------------------------------------------------------------------------------
if not args.no_mc:
    h("13. Batch 4 at the adopted ₱5,664 (math check §4.3 ii) with the cash branch's own simulator, 10,000 trials")
    ns = run_source("cash-and-capital.py", end="base_kw = dict(n=10000)")
    rows = []
    for lab, kw in (("pay at order (math check: 98%)", dict(start_cash=34000.0, pay="order")),
                    ("pay on pick-up", dict(start_cash=34000.0, pay="pickup")),
                    ("25 Nov payout held, pay at order", dict(start_cash=34000.0 + 423200, pay="order")),
                    ("25 Nov payout held, pay on pick-up", dict(start_cash=34000.0 + 423200, pay="pickup"))):
        for cost in (622400.0, 566400.0):
            o = ns["simulate"](n=10000, rule="rop", cost=cost, **kw)
            s = ns["summarize"](o, lab)
            rows.append((lab, cost, s["p_short"], s["topup_p50"], s["lost_gp_avg"], s["lost_gp_full"]))
            print(f"  {lab:36s} ₱{cost / P:,.0f}: short in {s['p_short']:.1%} of trials, median top-up ₱{s['topup_p50']:,.0f}, "
                  f"gross profit lost ₱{s['lost_gp_avg']:,.0f}-{s['lost_gp_full']:,.0f}")

# ---------------------------------------------------------------------------------------------
# 14. RESULT OF THE COMPARISON
# ---------------------------------------------------------------------------------------------
h("14. The consultant's figures against this check")
bad = [c for c in CHECKS if not c[3]]
for what, t_, m_, ok in CHECKS:
    if not ok:
        print(f"  DIFF  {what}: consultant {t_}, check {m_}")
print(f"{len(CHECKS) - len(bad)} of {len(CHECKS)} figures agree" + ("" if bad else " (all)"))
# known defects in the metrics file: the sensitivity rows share one key per stretch
sens_keys = [k for k in CONS if k.startswith("shown_sensitivity_")]
print(f"metrics file: {len(sens_keys)} 'shown_sensitivity_*' keys for 12 sensitivity rows -> each stretch keeps only its last "
      f"row (L 10, the 'other terms'): e.g. shown_sensitivity_stretch_2_late_order = {cons('shown_sensitivity_stretch_2_late_order'):,.0f}")
print(f"spec sentence for money_enough_at, read literally: {tm(SPEC_LITERAL_MONEY_ENOUGH)} -> order_days_late "
      f"{(O3 - max(lot, SPEC_LITERAL_MONEY_ENOUGH)) / DAY:.2f} d (section F expects 19 Nov 12:11 and 5.81 d)")
