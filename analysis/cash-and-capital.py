#!/usr/bin/env python3
"""Cash and capital branch: every number in analysis/cash-and-capital.md comes from this script.

Run:  python3 analysis/cash-and-capital.py      (offline; about 20 seconds)

Data
- Section 1 of analysis/baseline.py (the 26 Nov 2026 18:59 Manila pull of sales, payments, stock movements,
  batches, batch payments, expenses, distributions, reserve decisions). Only that data block is executed; the rest
  of baseline.py (which writes files) is not run. Re-checked live at 19:18: no new sale, payment, movement or
  expense since the pull.
- Added here: the times each money record was entered (read-only SELECT, 26 Nov 19:18 Manila), because the order
  of events on 25 Nov matters for this branch.
- Inputs from the other workstreams are labelled [A..] in the .md (the planning engine's next-order estimate comes
  from the maths review of the design: 37 pieces, P5,975 goods + P249 fees).

Privacy: no buyer names. Open balances are kept only as (sale day, amount).
Amounts: centavos in the data, pesos in the output. Writes analysis/cash-and-capital_metrics.json.
"""
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

P = 100.0
NOW = pd.Timestamp("2026-11-26 19:18")          # live re-check, nothing new since 18:59
TODAY = pd.Timestamp("2026-11-26")
DAY = pd.Timedelta(days=1)

# ---- money-record entry times (Manila), read-only SELECT 26 Nov 19:18 ----
SET_ASIDE_AT = [("2026-11-10 04:46:58", 0), ("2026-11-13 08:37:44", 719400), ("2026-11-20 02:04:41", 519400),
                ("2026-11-20 02:04:56", 725000), ("2026-11-25 02:04:25", 701400)]
BATCH_CREATED_AT = {1: "2026-11-07 13:25:13", 2: "2026-11-10 02:04:49", 3: "2026-11-25 07:34:58"}
BATCH_COMPANY_CENTS = {1: 0, 2: 519400, 3: 721400}          # cost less owner/investment payments
BATCH_COST_CENTS = {1: 503900, 2: 519400, 3: 721400}
RELEASE_AT = [("2026-11-25 07:48:29", 423200, 282133, 141067)]
EXPENSE_AT = [("2026-11-09 17:59:20", "2026-11-09", 64000), ("2026-11-24 01:59:03", "2026-11-24", 10000)]
BATCH_PAY_AT = [("2026-11-07 13:25:13", "2026-10-27", 503900, "owner", 1),
                ("2026-11-10 02:04:49", "2026-11-09", 519400, "company", 2),
                ("2026-11-25 07:34:58", "2026-11-25", 721400, "company", 3)]

# ---- inputs from other workstreams / design (labelled assumptions in the .md) ----
NEXT_ORDER_ENGINE = 597500 + 24900       # [A3] maths review: 37 pcs top-down, goods + fees
SHOP_PACE = 2.00                         # [A3] top-down shop pace (half-life 28), pieces/day while in stock
ROP_SHOP = 22.5                          # [A3] shop reorder point, pieces (L 7 guess, z 1.64)
GP_PER_EMPTY_DAY = (354.0, 576.0)        # baseline §6: avg pace / full shelf, pesos of gross profit
LANDED_MARGIN = 159.45                   # baseline §3, pesos a piece

M = {}
def put(name, value, unit, formula):
    v = float(value) if isinstance(value, (np.floating, np.integer, int, float)) else value
    M[name] = dict(value=round(v, 4) if isinstance(v, float) else v, unit=unit, formula=formula, as_of="2026-11-26")
    return value
def h(t): print(f"\n=== {t} ===")
def ps(c): return f"P{c / P:,.0f}"

# ---------------------------------------------------------------------------------------------
# frames
# ---------------------------------------------------------------------------------------------
prod = pd.DataFrame([(k, *v) for k, v in D["PRODUCTS"].items()], columns=["pid", "line", "flavour", "price", "cost"])
LINE_BATCH = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
prod["batch"] = prod["line"].map(LINE_BATCH)
BATCH_ID = {v[0]: k for k, v in D["BATCHES"].items()}
fees = {n: sum(D["BATCHES"][BATCH_ID[n]][3:]) for n in (1, 2, 3)}
pieces_in = {1: 30, 2: 30, 3: sum(q for _, q, _ in D["ORDER_LINES_B3"])}
prod["landed"] = prod["cost"] + prod["batch"].map({n: fees[n] / pieces_in[n] for n in fees})

sales = pd.DataFrame(D["SALES"], columns=["sid", "bd", "ts", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales["bd"] = pd.to_datetime(sales["bd"]); sales["ts"] = pd.to_datetime(sales["ts"])
done = sales[sales.status == "completed"].copy()
items = pd.DataFrame(D["ITEMS"], columns=["sid", "pid", "q", "up", "uc", "ltot"]).merge(prod, on="pid")
items = items.merge(sales[["sid", "status", "bd", "ts"]], on="sid")
it = items[items.status == "completed"].copy()
it["landed_cogs"] = it["q"] * it["landed"]
pays = pd.DataFrame(D["PAYMENTS"], columns=["sid", "amt", "bd", "ts"])
pays["bd"] = pd.to_datetime(pays["bd"]); pays["ts"] = pd.to_datetime(pays["ts"])
moves = pd.DataFrame(D["MOVES"], columns=["pid", "kind", "delta", "bid", "ts"])
moves["ts"] = pd.to_datetime(moves["ts"])

# checks against finance_report (baseline FIN_END)
FIN = D["FIN_END"]
assert done.tot.sum() == FIN["net"]
assert round(it.landed_cogs.sum()) == FIN["cogs"]

# ---------------------------------------------------------------------------------------------
# 1. Company-fund cash, day by day (business dates, as Finance counts them)
# ---------------------------------------------------------------------------------------------
h("1. Company-fund cash by day")
days = pd.date_range("2026-10-27", "2026-11-26", freq="D")
coll = (done[done.pm != "unpaid"].groupby("bd").tot.sum()
        .add(pays.groupby("bd").amt.sum(), fill_value=0)).reindex(days, fill_value=0)
stock_paid = pd.Series({pd.Timestamp(pd_): c for _, pd_, c, src, _ in BATCH_PAY_AT if src == "company"}).reindex(days, fill_value=0)
opex = pd.Series({pd.Timestamp(d): c for _, d, c in EXPENSE_AT}).reindex(days, fill_value=0)
dist = pd.Series({pd.Timestamp(t[:10]): a for t, a, _, _ in RELEASE_AT}).reindex(days, fill_value=0)
net_by_day = done.groupby("bd").tot.sum().reindex(days, fill_value=0)
cogs_by_day = it.groupby("bd").landed_cogs.sum().reindex(days, fill_value=0)
led = pd.DataFrame(dict(collected=coll, stock=stock_paid, opex=opex, dist=dist, net=net_by_day, cogs=cogs_by_day))
led["cash"] = (led.collected - led.stock - led.opex - led.dist).cumsum()
led["profit"] = (led.net - led.cogs - led.opex).cumsum()
led["retained"] = led.profit - led.dist.cumsum()
assert round(led.cash.iloc[-1]) == FIN["cash"] and round(led.retained.iloc[-1]) == FIN["retained"]
print(f"cash 26 Nov {ps(led.cash.iloc[-1])} (= finance_report), retained {ps(led.retained.iloc[-1])}")
op_cf = led.collected.sum() - led.stock.sum() - led.opex.sum()
put("operating_cash_flow_31d", op_cf / P, "PHP", "collected 17,720 - paid for stock 12,408 - expenses 740 (before distributions)")
put("payout_share_of_operating_cash", 423200 / op_cf, "share", "4,232 / 4,572")
print(f"collected {ps(led.collected.sum())} - stock {ps(led.stock.sum())} - expenses {ps(led.opex.sum())} = "
      f"{ps(op_cf)} before distributions {ps(led.dist.sum())}")
low = led.cash.idxmin()
put("cash_low_point", led.cash.min() / P, "PHP", f"lowest end-of-day company cash ({low.date()})")
print(f"lowest end-of-day cash {ps(led.cash.min())} on {low.date()}; highest {ps(led.cash.max())} on {led.cash.idxmax().date()}")
for d in ["2026-11-08", "2026-11-09", "2026-11-24", "2026-11-25", "2026-11-26"]:
    r = led.loc[d]
    print(f"  {d}: collected {ps(r.collected)}, stock {ps(r.stock)}, opex {ps(r.opex)}, dist {ps(r.dist)} -> cash {ps(r.cash)}")

# ---------------------------------------------------------------------------------------------
# 2. What the app showed at each moment (records as entered): reserve, spare cash, safe to distribute
# ---------------------------------------------------------------------------------------------
h("2. Reserve, spare cash and safe to distribute as the app showed them")
cash_sales = done[done.pm != "unpaid"][["ts", "tot"]]
sale_rows = done[["ts", "tot"]]
cogs_rows = it[["ts", "landed_cogs"]]

def kept_at(t):
    """Inventory reserve still kept at time t: latest decision - company cost of batches created since."""
    dec = [(pd.Timestamp(a), c) for a, c in SET_ASIDE_AT if pd.Timestamp(a) <= t]
    if not dec:
        return 0.0, False
    at, amt = dec[-1]
    used = sum(BATCH_COMPANY_CENTS[n] for n, ca in BATCH_CREATED_AT.items()
               if at < pd.Timestamp(ca) <= t and BATCH_COMPANY_CENTS[n] > 0)
    asks = any(at < pd.Timestamp(ca) <= t and BATCH_COMPANY_CENTS[n] > 0 for n, ca in BATCH_CREATED_AT.items())
    return max(0.0, amt - used), asks

def state_at(t, tax_bp=0):
    t = pd.Timestamp(t)
    collected = cash_sales[cash_sales.ts <= t].tot.sum() + pays[pays.ts <= t].amt.sum()
    stock = sum(c for a, _, c, s, _ in BATCH_PAY_AT if s == "company" and pd.Timestamp(a) <= t)
    ex = sum(c for a, _, c in EXPENSE_AT if pd.Timestamp(a) <= t)
    rel = sum(a for at, a, _, _ in RELEASE_AT if pd.Timestamp(at) <= t)
    net = sale_rows[sale_rows.ts <= t].tot.sum()
    cogs = cogs_rows[cogs_rows.ts <= t].landed_cogs.sum()
    tax = round(net * tax_bp / 10000)
    profit = net - cogs - ex - tax
    cash = collected - stock - ex - rel
    kept, asks = kept_at(t)
    spare = cash - tax - kept
    recv = net - collected
    return dict(cash=cash, kept=kept, asks=asks, tax=tax, spare=spare, retained=profit - rel,
                safe=max(0.0, min(profit - rel, spare)), profit=profit, receivables=recv)

moments = [("13 Nov 08:38 reserve set to P7,194", "2026-11-13 08:38"), ("20 Nov 02:05 reserve P7,250", "2026-11-20 02:05"),
           ("25 Nov 02:05 reserve P7,014", "2026-11-25 02:05"), ("25 Nov 07:34 just before Batch 3 paid", "2026-11-25 07:34:57"),
           ("25 Nov 07:35 Batch 3 paid, reserve used up", "2026-11-25 07:35"), ("25 Nov 07:48 just before payout", "2026-11-25 07:48:28"),
           ("25 Nov 07:49 after payout", "2026-11-25 07:49"), ("26 Nov 19:18 now", "2026-11-26 19:18")]
print(f"{'moment':45s} {'cash':>8s} {'reserve':>8s} {'spare':>8s} {'kept prof':>9s} {'safe':>8s} asks")
S = {}
for lab, t in moments:
    s = state_at(t); S[lab] = s
    print(f"{lab:45s} {s['cash']/P:8,.0f} {s['kept']/P:8,.0f} {s['spare']/P:8,.0f} {s['retained']/P:9,.0f} {s['safe']/P:8,.0f} {s['asks']}")
pre = S["25 Nov 07:48 just before payout"]; now = S["26 Nov 19:18 now"]
assert round(now["cash"]) == FIN["cash"] and round(now["safe"]) == FIN["safe_to_distribute"]
put("safe_before_payout_25nov", pre["safe"] / P, "PHP", "min(profit kept, cash - reserve) at 25 Nov 07:48, reserve 0 after Batch 3")
put("payout_share_of_safe", 423200 / pre["safe"], "share", "4,232 / safe at 07:48")
put("minutes_reset_to_payout", 14, "minutes", "Batch 3 entered 07:34:58 -> distribution 07:48:29")
print(f"payout {ps(423200)} = {423200 / pre['safe']:.1%} of safe ({ps(pre['safe'])}); 14 min after Batch 3 reset the reserve to P0")
print(f"open receivables at 07:48: {ps(pre['receivables'])}")
gap_days = (led.index[led.cash.lt(0)]).tolist()
print("days with negative end-of-day company cash:", [d.date().isoformat() for d in gap_days] or "none")

# reserve decisions vs the next company-paid order, and vs the app's pre-fill (latest company-paid batch)
h("2b. Reserve decisions vs the order they were for")
rows = []
for a, c in SET_ASIDE_AT:
    if c == 0:
        continue
    prefill = 519400                                  # latest company-paid batch at the time = Batch 2
    rows.append(dict(decided=a[:16], typed=c / P, prefill_same_as_last=prefill / P, next_order_B3=721400 / P,
                     typed_err=(c - 721400) / 721400, prefill_err=(prefill - 721400) / 721400))
rd = pd.DataFrame(rows); print(rd.to_string(index=False, float_format=lambda x: f"{x:,.3f}"))
put("prefill_error_same_as_last", (519400 - 721400) / 721400, "share", "Same as Batch 2 (5,194) vs Batch 3 (7,214)")
put("typed_reserve_error_max", rd.typed_err.abs().max(), "share", "owners' typed reserves vs Batch 3 cost")

# ---------------------------------------------------------------------------------------------
# 3. Order funding: could the company fund pay each order from its own cash?
# ---------------------------------------------------------------------------------------------
h("3. Order funding")
for _, pd_, c, src, n in BATCH_PAY_AT:
    d = pd.Timestamp(pd_)
    prev = led.cash.loc[:d - DAY].iloc[-1] if d > led.index[0] else 0.0
    before = prev + led.loc[d].collected - led.loc[d].opex           # that day's receipts and expenses, before stock
    print(f"Batch {n}: {ps(c)} paid {pd_} from {src}; company cash that day before paying {ps(before)}")
b2_before = led.loc["2026-11-09"].cash + led.loc["2026-11-09"].stock
b3_before = led.loc["2026-11-25"].cash + led.loc["2026-11-25"].stock + led.loc["2026-11-25"].dist
put("cash_before_batch2", b2_before / P, "PHP", "end-of-day 9 Nov cash + Batch 2 payment")
put("cash_before_batch3", b3_before / P, "PHP", "end-of-day 25 Nov cash + Batch 3 payment + payout")
print(f"Batch 2 covered {b2_before / 519400:.0%} from the fund; Batch 3 {b3_before / 721400:.0%}")

# ---------------------------------------------------------------------------------------------
# 4. Next-order estimate: options
# ---------------------------------------------------------------------------------------------
h("4. Next-order estimate (what the reserve should hold)")
landed_b3_pod = 16500 + fees[3] / pieces_in[3]
est = {
    "App pre-fill today: same as Batch 3 (latest company-paid)": 721400,
    "Planning engine, top-down (maths review): 37 pcs + fees": NEXT_ORDER_ENGINE,
    "Cross-check: shop pace 2.0 x 14.5-day rhythm at landed cost": SHOP_PACE * 14.5 * landed_b3_pod,
    "Cross-check: pace 2.22 (no recency weight) x 14.5": 2.22 * 14.5 * landed_b3_pod,
    "Mean of Batches 1-3 cost in full": np.mean(list(BATCH_COST_CENTS.values())),
}
for k, v in est.items():
    print(f"  {k:62s} {ps(v)}")
put("next_order_estimate_engine", NEXT_ORDER_ENGINE / P, "PHP", "37 pcs x cost + fees (maths review, top-down plan)")
put("prefill_overhold_vs_engine", (721400 - NEXT_ORDER_ENGINE) / P, "PHP", "same-as-Batch-3 pre-fill - engine estimate")
fee_flat = np.mean([fees[1], fees[2], fees[3]])
print(f"fees per order {[fees[n] / P for n in (1, 2, 3)]} -> mean {ps(fee_flat)}; per piece "
      f"{[round(fees[n] / pieces_in[n] / P, 2) for n in (1, 2, 3)]}")

# ---------------------------------------------------------------------------------------------
# 5. Running costs, break-even and runway
# ---------------------------------------------------------------------------------------------
h("5. Running costs, break-even, runway")
days_cov = 31
run_month = 74000 / days_cov * 30
put("running_costs_month", run_month / P, "PHP/month", "all non-tax expenses (740) / 31 days x 30; starting guess (<60 days)")
gp_month = (FIN["net"] - FIN["cogs"]) / 31 * 30
put("gross_profit_month_recorded", gp_month / P, "PHP/month", "9,567 / 31 x 30")
print(f"running costs {ps(run_month)} a month = {run_month / P / LANDED_MARGIN:.1f} pieces of landed margin; "
      f"gross profit {ps(gp_month)} a month")
cap_full = 3.61 * 30
rows = []
for F in [716, 5000, 10000, 15000, 20000]:
    be = F / LANDED_MARGIN
    rows.append(dict(fixed_month=F, breakeven_pcs_month=be, vs_recent_58=be / (60 / 31 * 30),
                     vs_full_shelf_108=be / cap_full, runway_days_on_spare=340 / (F / 30),
                     net_profit_31d_if_F=(FIN["net_profit"] + 74000) / P - F * 31 / 30))
be = pd.DataFrame(rows); print(be.to_string(index=False, float_format=lambda x: f"{x:,.2f}"))
put("runway_days_running_costs", 340 / (run_month / P / 30), "days", "spare cash 340 / (716/30)")

# ---------------------------------------------------------------------------------------------
# 6. Cash conversion cycle and working capital the shop needs
# ---------------------------------------------------------------------------------------------
h("6. Cash conversion cycle and working capital")
DSO, DIO = 6.21, 4.39                   # baseline §9
cogs_day_rec = FIN["cogs"] / P / 31
rows = []
for lab, cogs_day in [("recorded (P330/day)", cogs_day_rec), ("plan pace 2.0 x P172", SHOP_PACE * 171.6),
                      ("full shelf 3.61 x P172", 3.61 * 171.6)]:
    for terms, dpo in [("pay at order, 7-day delivery", -7), ("pay on pick-up", 0)]:
        ccc = DSO + DIO - dpo
        rows.append(dict(volume=lab, terms=terms, ccc_days=ccc, wc_needed=cogs_day * ccc))
wc = pd.DataFrame(rows); print(wc.to_string(index=False, float_format=lambda x: f"{x:,.0f}"))
equity = (FIN["capital"] + FIN["retained"]) / P
print(f"equity in the business {equity:,.0f} = owner capital {FIN['capital'] / P:,.0f} + profit kept {FIN['retained'] / P:,.0f}")
put("equity", equity, "PHP", "owner capital 5,039 + profit kept 4,595")
put("ccc_prepay_7d", DSO + DIO + 7, "days", "6.2 DSO + 4.4 DIO + 7 days paid ahead (DPO -7)")
avg_recv = DSO * FIN["net"] / P / 31
put("avg_receivables", avg_recv, "PHP", "DSO 6.21 x 19,800/31")
put("cash_freed_per_10pts_credit", avg_recv * 10 / 73.43, "PHP", "avg receivables x 10 / 73.4 credit share")
print(f"average receivables {avg_recv:,.0f}; each 10 points of credit share moved to cash frees ~{avg_recv * 10 / 73.43:,.0f}")

# ---------------------------------------------------------------------------------------------
# 7. Monte Carlo: will the company fund have Batch 4's money on its order day?
# ---------------------------------------------------------------------------------------------
h("7. Monte Carlo cash forecast to Batch 4 (10,000 trials)")
# days to collect a credit sale: 31 paid in full + 2 open balances older than the median, at their age (16)
paid_credit = done[(done.pm == "unpaid") & (done.bal == 0)]
last_pay = pays.groupby("sid").bd.max()
DELAYS = np.array([(last_pay[s] - b).days for s, b in zip(paid_credit.sid, paid_credit.bd)] + [16, 16])
assert len(DELAYS) == 33
CREDIT_SHARE = 14540 / 19800
OPEN = [(b, bal) for b, bal in zip(done.bd, done.bal) if bal > 0]          # (sale day, centavos) only
assert sum(b for _, b in OPEN) == FIN["receivables"]

def sale_offsets(batch_pids, arrival, exclude_ts):
    mv = moves[moves.pid.isin(batch_pids) & (moves.kind == "sale") & ~moves.ts.isin(exclude_ts)]
    return np.repeat(((mv.ts - arrival) / DAY).values, (-mv.delta).values)
B1_OFF = sale_offsets(prod[prod.batch == 1].pid, pd.Timestamp("2026-10-27 09:15:05"), [])
B2_OFF = sale_offsets(prod[prod.batch == 2].pid, pd.Timestamp("2026-11-09 19:55:50"),
                      [pd.Timestamp("2026-11-22 07:54:36")])          # voided, rung again 25 Nov
assert len(B1_OFF) == 30 and len(B2_OFF) == 30

T0 = (NOW - pd.Timestamp("2026-11-25 07:34:58")) / DAY        # now, in days since Batch 3 was ordered
HORIZON = 75.0
def tri(rng, n): return rng.triangular(5, 7, 10, n)            # [A4] delivery days, owner's 5-7 plus a late tail

def simulate(n=10000, start_cash=34000.0, rule="rop", pay="order", cost=NEXT_ORDER_ENGINE, stress=False, seed=7,
             L_fixed=None, credit_share=CREDIT_SHARE):
    rng = np.random.default_rng(seed)
    run_day = run_month / 30
    out = dict(short=np.zeros(n, bool), topup=np.zeros(n), wait=np.zeros(n), empty_wait=np.zeros(n),
               empty_free=np.zeros(n), cash_pay=np.zeros(n), order_day=np.zeros(n), b3_payback=np.zeros(n),
               cash_10dec=np.zeros(n))
    d10 = (pd.Timestamp("2026-12-10 23:59") - pd.Timestamp("2026-11-25 07:34:58")) / DAY
    for k in range(n):
        L3 = tri(rng, 1)[0]; L4 = tri(rng, 1)[0]
        if L_fixed is not None:
            L3 = L4 = float(L_fixed)
        arr = L3                                               # days since 25 Nov 07:35
        m = rng.lognormal(0.2 if stress else 0.0, 0.35)
        off = (B1_OFF if rng.random() < 0.5 else B2_OFF) * m
        pods = np.sort(arr + off)
        rd = 0.0 if stress else rng.uniform(0, 0.5)            # [A6] device sales a day: no history
        dev = arr + np.cumsum(rng.exponential(1 / rd, 10)) if rd > 0 else np.array([])
        dev = dev[dev < HORIZON]
        t_sales = np.concatenate([pods, dev]); price = np.concatenate([np.full(len(pods), 34000.0), np.full(len(dev), 35000.0)])
        credit = rng.random(len(t_sales)) < credit_share
        delay = rng.choice(DELAYS, len(t_sales))
        t_in = np.where(credit, np.floor(t_sales) + delay + 0.99, t_sales)   # collected late on the day
        # existing balances: remaining days drawn from delays longer than their age
        o_t, o_a = [], []
        for bd, bal in OPEN:
            age = (TODAY - bd).days
            pool = DELAYS[DELAYS > age]
            if stress and age >= 16:
                continue                                       # stress: the two 16-day balances never paid
            dd = rng.choice(pool) if len(pool) else age + 7
            o_t.append(T0 + (dd - age) + 0.0); o_a.append(bal)
        ev_t = np.concatenate([t_in, o_t]); ev_a = np.concatenate([price, o_a])
        order = np.argsort(ev_t); ev_t = ev_t[order]; ev_a = ev_a[order]; cum = np.cumsum(ev_a)
        def cash(t):
            i = np.searchsorted(ev_t, t, side="right")
            return start_cash + (cum[i - 1] if i > 0 else 0.0) - run_day * max(0.0, t - T0)
        # B3 payback in cash: first time B3's own collections reach its cost
        b3_t = np.sort(t_in); b3_cum = np.cumsum(price[np.argsort(t_in)])
        j = np.searchsorted(b3_cum, 721400)
        out["b3_payback"][k] = b3_t[j] if j < len(b3_t) else np.nan
        # order trigger
        all_sorted = np.sort(t_sales)
        if rule == "rop":
            need = int(np.ceil(40 - ROP_SHOP))                 # 18th piece sold -> position 22 <= 22.5
            t_o = all_sorted[need - 1] if len(all_sorted) >= need else HORIZON
        else:                                                  # current habit: about 2 pods left
            t_o = pods[27]
        t_o = max(t_o, T0)
        t_p = t_o if pay == "order" else t_o + L4
        c = cash(t_p)
        out["cash_pay"][k] = c; out["order_day"][k] = t_o
        out["cash_10dec"][k] = cash(d10)
        if c >= cost:
            t_paid = t_p
        else:
            out["short"][k] = True; out["topup"][k] = cost - c
            cand = ev_t[ev_t > t_p]
            ok = [t for t in cand if cash(t) >= cost]
            t_paid = ok[0] if ok else HORIZON
        out["wait"][k] = t_paid - t_p
        arr4_free = t_o + L4
        arr4 = (t_paid + L4) if pay == "order" else t_paid
        sell_out = pods[-1]
        out["empty_free"][k] = max(0.0, arr4_free - sell_out)
        out["empty_wait"][k] = max(0.0, arr4 - sell_out)
    return out

def summarize(o, label):
    extra = o["empty_wait"] - o["empty_free"]
    r = dict(scenario=label, p_short=o["short"].mean(), topup_p50=np.percentile(o["topup"][o["short"]], 50) / P if o["short"].any() else 0.0,
             topup_p90=np.percentile(o["topup"], 90) / P, mean_wait_days=o["wait"].mean(),
             empty_days_total=o["empty_wait"].mean(), extra_empty_days=extra.mean(), lost_gp_avg=extra.mean() * GP_PER_EMPTY_DAY[0],
             lost_gp_full=extra.mean() * GP_PER_EMPTY_DAY[1],
             cash_at_pay_p10=np.percentile(o["cash_pay"], 10) / P, cash_at_pay_p50=np.percentile(o["cash_pay"], 50) / P)
    return r

base_kw = dict(n=10000)
scen = [
    ("S1 today: P340 cash, order at reorder point, pay at order", dict(start_cash=34000.0, rule="rop", pay="order")),
    ("S2 today, pay on pick-up", dict(start_cash=34000.0, rule="rop", pay="pickup")),
    ("S3 25 Nov payout held (P4,572 cash), pay at order", dict(start_cash=34000.0 + 423200, rule="rop", pay="order")),
    ("S4 today, order at sell-out (habit), pay at order", dict(start_cash=34000.0, rule="late", pay="order")),
    ("S5 stress: slower sales, no devices, P380 never paid", dict(start_cash=34000.0, rule="rop", pay="order", stress=True)),
    ("S6 S1 with next order = Batch 3 cost (P7,214)", dict(start_cash=34000.0, rule="rop", pay="order", cost=721400.0)),
]
res, OUT = [], {}
for lab, kw in scen:
    o = simulate(**base_kw, **kw); OUT[lab] = o
    res.append(summarize(o, lab))
R = pd.DataFrame(res)
pd.set_option("display.width", 220)
print(R.to_string(index=False, float_format=lambda x: f"{x:,.2f}"))
o1 = OUT[scen[0][0]]
od = pd.Timestamp("2026-11-25 07:34:58") + pd.to_timedelta(np.percentile(o1["order_day"], [10, 50, 90]), unit="D")
print("S1 Batch 4 order day P10/P50/P90:", [d.strftime("%d %b") for d in od])
print("S1 cash on 10 Dec P10/P50/P90:", [f"{v / P:,.0f}" for v in np.percentile(o1["cash_10dec"], [10, 50, 90])])
pb = pd.Timestamp("2026-11-25 07:34:58") + pd.to_timedelta(np.nanpercentile(o1["b3_payback"], [10, 50, 90]), unit="D")
print("Batch 3 earns its cost back in cash P10/P50/P90:", [d.strftime("%d %b") for d in pb],
      f"= {np.nanpercentile(o1['b3_payback'], 50):.1f} days after it was paid (B1/B2: 10-11 days after arrival, paid on arrival)")
for _, r in R.iterrows():
    key = r.scenario.split()[0]
    put(f"mc_{key}_p_short", r.p_short, "share", r.scenario)
    put(f"mc_{key}_lost_gp", r.lost_gp_avg, "PHP per cycle", "extra empty days from waiting for cash x 354")
put("mc_S1_topup_p50", R.iloc[0].topup_p50, "PHP", "owner money needed when short (median)")
put("batch3_cash_payback_days", float(np.nanpercentile(o1["b3_payback"], 50)), "days", "from 25 Nov payment to Batch 3 collections >= 7,214")

# sensitivity on the two drivers that matter most: delivery days and credit share
h("7a. Sensitivity: delivery days x credit share (pay at order, 3,000 trials each)")
rows = []
for cash0, lab in [(34000.0, "P340 (today)"), (34000.0 + 423200, "P4,572 (payout held)")]:
    for L in (5, 7, 10):
        for cs in (0.50, CREDIT_SHARE):
            o = simulate(n=3000, start_cash=cash0, L_fixed=L, credit_share=cs, seed=5)
            rows.append(dict(start=lab, delivery_days=L, credit_share=round(cs, 3), p_short=o["short"].mean(),
                             topup_p50=np.median(o["topup"]) / P, cash_at_pay_p50=np.median(o["cash_pay"]) / P))
sens = pd.DataFrame(rows); print(sens.to_string(index=False, float_format=lambda x: f"{x:,.2f}"))

# what payout on 25 Nov would have kept the chance of being short <= 10% (pay at order / on pick-up)?
h("7b. Largest 25 Nov payout that keeps P(short for Batch 4) <= 10%")
best = {}
for pay in ("order", "pickup"):
    ok = 0.0
    for x in np.arange(0, 4572 + 1, 250):
        o = simulate(n=3000, start_cash=34000.0 + 423200 - x * P, rule="rop", pay=pay, seed=11)
        if o["short"].mean() <= 0.10:
            ok = x
    best[pay] = ok
    print(f"pay {pay}: up to about P{ok:,.0f} (actual payout P4,232)")
put("max_payout_10pct_risk_prepay", best["order"], "PHP", "grid search, 3,000 trials each, step 250")
put("max_payout_10pct_risk_pickup", best["pickup"], "PHP", "same, paying on pick-up")

# ---------------------------------------------------------------------------------------------
# 8. Payout rules at the two moments that matter
# ---------------------------------------------------------------------------------------------
h("8. Payout rules")
def p_collected_by(age, days_ahead):
    pool = DELAYS[DELAYS > age]
    return float((pool <= age + days_ahead).mean()) if len(pool) else 0.0
def rules(st, t, order_by, last_company=721400.0):
    rec_by = 0.0
    t = pd.Timestamp(t)
    open_then = [(b, bal) for b, bal in OPEN]               # same six balances (the 26 Nov sale offsets a 26 Nov payment)
    ahead = (pd.Timestamp(order_by) - t.normalize()).days
    for bd, bal in open_then:
        rec_by += bal * p_collected_by((t.normalize() - bd).days, ahead)
    hold = max(0.0, NEXT_ORDER_ENGINE - st["kept"] - rec_by)
    a = st["safe"]
    b = max(0.0, min(st["safe"], st["spare"] - hold - run_month))
    kept_c = last_company if st["asks"] or st["kept"] == 0 else st["kept"]
    c = max(0.0, min(st["retained"], st["cash"] - st["tax"] - kept_c))
    return dict(A_today=a / P, B_suggested=b / P, C_hold_last_batch=c / P, expected_collections=rec_by / P, hold=hold / P)
for lab, st, t in [("25 Nov 07:48", pre, "2026-11-25 07:48"), ("26 Nov now", now, "2026-11-26 19:18")]:
    print(lab, {k: round(v) for k, v in rules(st, t, "2026-12-10").items()})
rb = rules(pre, "2026-11-25 07:48", "2026-12-10")
put("rule_B_suggested_25nov", rb["B_suggested"], "PHP", "min(safe, spare - (next order - kept - collections expected by 10 Dec) - month of running costs)")
put("rule_C_25nov", rb["C_hold_last_batch"], "PHP", "safe with reserve = last company batch while the question is open")
# when would the suggested rule allow a payout again? cash must exceed hold + running month after Batch 4 is paid

# tax at the statutory 3%
st3 = state_at("2026-11-25 07:48:28", tax_bp=300); now3 = state_at("2026-11-26 19:18", tax_bp=300)
print(f"at 3% tax: safe before payout {ps(st3['safe'])} (vs {ps(pre['safe'])}); now {ps(now3['safe'])}; tax to date {ps(now3['tax'])}")
put("tax_3pct_month", 0.03 * FIN["net"] / P / 31 * 30, "PHP/month", "3% x net sales a month at the recorded pace")
put("safe_before_payout_at_3pct", st3["safe"] / P, "PHP", "same moment with a 3% tax reserve")

# ---------------------------------------------------------------------------------------------
# 9. Self-funded growth (Higgins' sustainable growth, per order cycle) and the payout ratio
# ---------------------------------------------------------------------------------------------
h("9. Self-funded growth per order cycle")
roi = {1: 392100 / 503900, 2: 490600 / 519400}
r_mean = np.mean(list(roi.values()))
print(f"batch net profit / batch cost: B1 {roi[1]:.1%}, B2 {roi[2]:.1%}, mean {r_mean:.1%}")
rows = []
for p in [0.0, 0.25, 0.479, 0.64, 0.75, 1.0]:
    rows.append(dict(payout_ratio=p, max_batch_growth_per_cycle=(1 - p) * r_mean))
g = pd.DataFrame(rows); print(g.to_string(index=False, float_format=lambda x: f"{x:.1%}"))
need_growth = 3.61 * 14.5 / 40 - 1
print(f"demand-led growth to a full-shelf batch: 3.61 x 14.5 = {3.61 * 14.5:.0f} pcs vs 40 -> {need_growth:.0%}; "
      f"engine's next order 37 pcs -> {37 / 40 - 1:.0%}")
put("batch_roi_mean", r_mean, "share per cycle", "mean(3,921/5,039, 4,906/5,194)")
put("max_payout_ratio_self_funding_full_shelf", 1 - need_growth / r_mean, "share", "1 - growth needed / batch ROI")
put("payout_ratio_to_date", 423200 / 882700, "share", "4,232 / 8,827")

# ---------------------------------------------------------------------------------------------
# 10. Who carries a top-up: the 2 : 1 split and owner capital
# ---------------------------------------------------------------------------------------------
h("10. Payout followed by an owner top-up")
own, mgr = 2821.33, 1410.67
for T in [0, R.iloc[0].topup_p50, 4232]:
    print(f"top-up P{T:,.0f}: owner net {own - T:,.0f}, manager {mgr:,.0f}, owner capital becomes {5039 + T:,.0f}")
put("owner_net_if_full_topup", own - 4232, "PHP", "2,821.33 received - 4,232 put back as capital")

with open(os.path.join(HERE, "cash-and-capital_metrics.json"), "w", encoding="utf-8") as f:
    json.dump(M, f, indent=1, ensure_ascii=False)
print(f"\nwrote {len(M)} metrics to analysis/cash-and-capital_metrics.json")
