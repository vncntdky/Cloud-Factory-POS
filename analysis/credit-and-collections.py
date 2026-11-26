#!/usr/bin/env python3
"""Credit and collections branch: every number in analysis/credit-and-collections.md comes from this script.

Run:  python3 analysis/credit-and-collections.py      (offline, a few seconds; numpy + pandas only)

Data
- Section 1 of analysis/baseline.py: the read-only pull of 26 Nov 2026 18:59 Manila (sales, sale lines, later
  payments, stock movements, batches, expenses). Only that data block is executed; the rest of baseline.py (which
  writes files) is not run. Re-checked live at 19:41 Manila: still 51 completed sales (37 "Not paid yet"),
  36 payments (P12,460, all cash), P2,080 owed, 81 stock movements, last sale and payment at 11:16.
- Inputs from the other branches are labelled [A..] in the .md (order-by day, next order cost, delivery time,
  pace while in stock, gross profit per empty day).

Privacy: no buyer names exist in the data. `bk` is a pseudonymous buyer number from baseline.py; this script uses it
only to group sales by buyer and prints aggregates only (counts, shares, distributions). Nothing per buyer is printed.

Amounts: centavos in the data, pesos in the output. Writes analysis/credit-and-collections_metrics.json.
"""
import json
import math
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
TODAY = pd.Timestamp("2026-11-26")
NOW = pd.Timestamp("2026-11-26 19:41")          # live re-check; nothing new since the 18:59 pull
DAY = pd.Timedelta(days=1)
RNG = np.random.default_rng(20261126)

# ---- inputs from the other branches and the fact base (labelled [A..] in the .md) ----
LANDED_MARGIN = 159.45          # baseline §3: landed gross profit a piece
LANDED_COST_POD = 171.60        # baseline §3: Batch 3 pod, P165 + P6.60 fees
GP_PER_EMPTY_DAY = 354.0        # baseline §6: 2.22 pieces a day x P159.45
POD_PRICE = 340.0               # Batch 3 pods
PACE = 2.22                     # baseline: pieces a day while the shop has stock
B3_PODS = 30                    # Batch 3 pods on the way (devices left out: no history)
ARRIVE = pd.Timestamp("2026-12-02")      # [A] 25 Nov + 7 days (starting guess; no delivery measured yet)
ORDER_BY = pd.Timestamp("2026-12-05")    # [A] stock-and-ordering branch: fixed engine "Order by Sat 5 Dec"
ORDER_COST = 6224.0             # [A] cash-and-capital A3: 37 pieces, P5,975 goods + P249 fees
DELIVERY_DAYS = 7               # [A] same starting guess for Batch 4
RUN_COST_PER_DAY = 740.0 / 31   # recorded expenses, 31 days

M = {}
def put(name, value, unit, formula):
    if isinstance(value, (np.floating, np.integer)):
        value = value.item()
    if isinstance(value, float):
        value = round(value, 4)
    M[name] = dict(value=value, unit=unit, formula=formula, as_of="2026-11-26")
    return value

def h(title):
    print(f"\n=== {title} ===")

def peso(x):
    return f"P{x:,.0f}"

def pdisc(values, q):
    """Postgres percentile_disc(q): first value whose cumulative position >= q."""
    v = sorted(values)
    if not v:
        return None
    i = max(0, math.ceil(q * len(v)) - 1)
    return v[i]

# ---------------------------------------------------------------------------------------------
# 0. FRAMES
# ---------------------------------------------------------------------------------------------
prod = pd.DataFrame([(k, *v) for k, v in D["PRODUCTS"].items()], columns=["pid", "line", "flavour", "price", "cost"])
LINE_BATCH = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
prod["batch"] = prod["line"].map(LINE_BATCH)

sales = pd.DataFrame(D["SALES"], columns=["sid", "bd", "ts", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales["bd"] = pd.to_datetime(sales["bd"])
sales["ts"] = pd.to_datetime(sales["ts"])
done = sales[sales.status == "completed"].copy()
for c in ("sub", "disc", "tot", "bal"):
    done[c] = done[c] / P
items = pd.DataFrame(D["ITEMS"], columns=["sid", "pid", "q", "up", "uc", "ltot"]).merge(prod, on="pid")
pieces = items.groupby("sid")["q"].sum()
batch_of = items.groupby("sid")["batch"].agg(lambda s: int(s.mode().iloc[0]))
done["pieces"] = done["sid"].map(pieces)
done["batch"] = done["sid"].map(batch_of)

pays = pd.DataFrame(D["PAYMENTS"], columns=["sid", "amt", "bd", "ts"])
pays["bd"] = pd.to_datetime(pays["bd"])
pays["ts"] = pd.to_datetime(pays["ts"])
pays["amt"] = pays["amt"] / P

credit = done[done.pm == "unpaid"].copy()
cash_sales = done[done.pm != "unpaid"].copy()
net_sales = done["tot"].sum()
assert abs(net_sales - D["FIN_END"]["net"] / P) < 0.01
assert abs(credit["bal"].sum() - D["FIN_END"]["receivables"] / P) < 0.01
assert abs(pays["amt"].sum() - (D["FIN_END"]["collected"] / P - cash_sales["tot"].sum())) < 0.01

last_pay = pays.groupby("sid")["bd"].max()
n_pay = pays.groupby("sid").size()
credit["paid_full"] = credit["bal"] == 0
credit["n_pay"] = credit["sid"].map(n_pay).fillna(0).astype(int)
credit["last_pay"] = credit["sid"].map(last_pay)
credit["days"] = (credit["last_pay"] - credit["bd"]).dt.days          # paid in full only
credit["age"] = (TODAY - credit["bd"]).dt.days                         # open ones
paid = credit[credit.paid_full].copy()
openb = credit[~credit.paid_full].copy()
pdays = paid["days"].astype(int).tolist()
assert len(paid) == 31 and len(openb) == 6

CAL_DAYS = 31
sales_per_day = net_sales / CAL_DAYS

# ---------------------------------------------------------------------------------------------
# 1. THE CREDIT BOOK
# ---------------------------------------------------------------------------------------------
h("1. Credit book")
cs_val = credit["tot"].sum() / net_sales
cs_cnt = len(credit) / len(done)
put("credit_share_value", cs_val, "share", "Not paid yet sales / net sales (37 of 51 sales)")
put("credit_share_count", cs_cnt, "share", "Not paid yet sales / completed sales")
print(f"credit share: {cs_val:.1%} of value, {cs_cnt:.1%} of sales ({len(credit)} of {len(done)})")
for b in (1, 2):
    sub = done[done.batch == b]
    c = sub[sub.pm == "unpaid"]
    print(f"  batch {b} period: credit {c.tot.sum()/sub.tot.sum():.1%} of value, {len(c)}/{len(sub)} sales")
    put(f"credit_share_batch{b}", c.tot.sum() / sub.tot.sum(), "share", f"credit value / net sales of batch {b}")

tick = credit.groupby("pieces").agg(n=("sid", "size"), value=("tot", "sum"))
print("credit tickets by pieces:", tick.to_dict("index"))
cash_tick = cash_sales.groupby("pieces").size().to_dict()
print("cash tickets by pieces:", cash_tick)
med_ticket = float(np.median(credit["tot"]))
put("credit_ticket_median", med_ticket, "PHP", "median Not paid yet sale")
put("credit_multi_piece_share", (credit.pieces > 1).mean(), "share", "credit sales with 2+ pieces")
put("cash_multi_piece_share", (cash_sales.pieces > 1).mean(), "share", "cash sales with 2+ pieces")

# buyers
buyers = done.groupby("bk").agg(n=("sid", "size"), value=("tot", "sum"),
                                credit_n=("pm", lambda s: (s == "unpaid").sum()))
rep = buyers[buyers.n >= 2]
put("buyers", len(buyers), "buyers", "distinct pseudonymous buyers")
put("credit_buyers", int((buyers.credit_n > 0).sum()), "buyers", "buyers with 1+ Not paid yet sale")
put("repeat_buyers", len(rep), "buyers", "buyers with 2+ sales")
put("repeat_buyers_using_credit", int((rep.credit_n > 0).sum()), "buyers", "repeat buyers with 1+ credit sale")
put("repeat_buyer_value_share", rep.value.sum() / net_sales, "share", "net sales from repeat buyers")
one = buyers[buyers.n == 1]
put("one_time_buyer_credit_rate", (one.credit_n > 0).mean(), "share", "one-time buyers who bought on credit")
put("repeat_buyer_credit_rate", (rep.credit_n > 0).mean(), "share", "repeat buyers who bought on credit at least once")
rep_credit = rep[rep.credit_n > 0]
print(f"one-time buyers who bought on credit: {(one.credit_n > 0).mean():.1%} ({int((one.credit_n>0).sum())} of {len(one)}); "
      f"repeat buyers who used credit: {(rep.credit_n > 0).mean():.1%}")
print(f"buyers {len(buyers)}, on credit {int((buyers.credit_n>0).sum())}, repeat {len(rep)} "
      f"({int((rep.credit_n>0).sum())} used credit), repeat share of sales {rep.value.sum()/net_sales:.1%}")
credit_value_from_repeat = credit[credit.bk.isin(rep.index)]["tot"].sum() / credit["tot"].sum()
put("credit_value_from_repeat_buyers", credit_value_from_repeat, "share", "credit sales value from repeat buyers")
print(f"credit value from repeat buyers: {credit_value_from_repeat:.1%}")

# ---------------------------------------------------------------------------------------------
# 2. DAYS TO COLLECT
# ---------------------------------------------------------------------------------------------
h("2. Days to collect (31 paid in full)")
arr = np.array(pdays)
w = paid["tot"].to_numpy()
print("sorted days:", sorted(pdays))
vw_mean = float((arr * w).sum() / w.sum())
put("days_to_collect_median", float(np.median(arr)), "days", "sale day -> last payment day, paid in full")
put("days_to_collect_mean", float(arr.mean()), "days", "same, mean")
put("days_to_collect_value_weighted", vw_mean, "days", "same, weighted by sale value")
for q in (0.5, 0.8, 0.9, 0.95):
    put(f"days_to_collect_pdisc_{int(q*100)}", pdisc(pdays, q), "days", f"percentile_disc({q}) of paid days")
print("percentile_disc p50/p80/p90/p95:", [pdisc(pdays, q) for q in (0.5, 0.8, 0.9, 0.95)])
for d in (3, 7, 9, 11, 12, 14):
    put(f"paid_within_{d}_days", float((arr <= d).mean()), "share", f"paid in full within {d} days")
print("share paid within 7 / 9 / 12 / 14 days:",
      [round(float((arr <= d).mean()), 3) for d in (7, 9, 12, 14)])
for b in (1, 2):
    a = paid[paid.batch == b]["days"]
    print(f"  batch {b} period: n {len(a)}, median {a.median()}, mean {a.mean():.1f}")
by_pieces = paid.groupby(paid.pieces > 1)["days"].agg(["size", "median", "mean"])
print("by ticket size (multi-piece?):", by_pieces.to_dict("index"))
put("days_to_collect_median_1piece", float(paid[paid.pieces == 1]["days"].median()), "days", "1-piece credit sales")
put("days_to_collect_median_multi", float(paid[paid.pieces > 1]["days"].median()), "days", "2+ piece credit sales")
put("credit_sales_paid_in_parts", int((credit.n_pay > 1).sum() + ((credit.n_pay == 1) & (credit.bal > 0)).sum()),
    "sales", "credit sales with 2+ payments, or a part payment and a balance left")

# Kaplan-Meier with the open balances counted as "not paid yet at their age" (right-censored)
def kaplan_meier(times, events):
    t = np.asarray(times, float); e = np.asarray(events, int)
    out = []; s = 1.0
    for u in np.unique(t[e == 1]):
        n_risk = int((t >= u).sum()); d = int(((t == u) & (e == 1)).sum())
        s *= (1 - d / n_risk)
        out.append((u, s, n_risk, d))
    return out

def km_quantile(km, q):
    for u, s, _, _ in km:
        if 1 - s >= q - 1e-12:
            return int(u)
    return None

km_t = pdays + openb["age"].astype(int).tolist()
km_e = [1] * len(pdays) + [0] * len(openb)
km = kaplan_meier(km_t, km_e)
km_q = {q: km_quantile(km, q) for q in (0.5, 0.8, 0.9, 0.95)}
print("Kaplan-Meier (open balances censored) p50/p80/p90/p95:", km_q)
for q, v in km_q.items():
    put(f"km_days_p{int(q*100)}", v, "days", "Kaplan-Meier quantile, open balances right-censored at their age")
s_at = {d: next((s for u, s, _, _ in reversed(km) if u <= d), 1.0) for d in (7, 9, 12, 14, 21)}
print("KM still unpaid after 7 / 9 / 12 / 14 / 21 days:", {k: round(v, 3) for k, v in s_at.items()})
put("km_unpaid_after_14", s_at[14], "share", "Kaplan-Meier share still unpaid 14 days after the sale")

# How buyers pay: at their next purchase?
pays_b = pays.merge(credit[["sid", "bk", "bd"]].rename(columns={"bd": "sale_bd"}), on="sid")
buy_days = done.groupby("bk")["bd"].apply(set)
pays_b["with_purchase"] = [bd in buy_days.get(b, set()) and bd != sb
                           for bd, b, sb in zip(pays_b["bd"], pays_b["bk"], pays_b["sale_bd"])]
share_pay_with_buy = pays_b["with_purchase"].mean()
share_val_with_buy = pays_b.loc[pays_b.with_purchase, "amt"].sum() / pays_b["amt"].sum()
put("payments_on_a_purchase_day", float(share_pay_with_buy), "share",
    "later payments made on a day the same buyer bought again (not the sale's own day)")
put("payment_value_on_a_purchase_day", float(share_val_with_buy), "share", "same, by value")
print(f"later payments on a day the buyer bought again: {share_pay_with_buy:.1%} of payments, "
      f"{share_val_with_buy:.1%} of value")

# ---------------------------------------------------------------------------------------------
# 3. STILL OWED, AGE, CONCENTRATION; RECEIVABLES OVER TIME; DSO
# ---------------------------------------------------------------------------------------------
h("3. Still owed")
owed = openb["bal"].sum()
ages = openb["age"].astype(int).tolist()
print(f"still owed {peso(owed)} on {len(openb)} sales, {openb.bk.nunique()} buyers; ages {sorted(ages)}; "
      f"balances {sorted(openb.bal.tolist())}")
put("still_owed", owed, "PHP", "sum of open balances")
put("still_owed_share_net_sales", owed / net_sales, "share", "still owed / net sales")
put("largest_open_balance_share", openb.groupby("bk").bal.sum().max() / owed, "share", "largest buyer / still owed")
put("still_owed_balance_weighted_age", float((openb.bal * openb.age).sum() / owed), "days", "balance-weighted age")
hhi = float(((openb.groupby("bk").bal.sum() / owed) ** 2).sum())
put("still_owed_hhi", hhi, "index 0-1", "Herfindahl index of what is owed, by buyer (1/HHI = equivalent buyers)")
print(f"HHI {hhi:.3f} (= {1/hhi:.1f} equal-sized buyers)")

# receivables at the end of each business day
days_all = pd.date_range("2026-10-27", TODAY)
rec = []
for d in days_all:
    s_ = credit[credit.bd <= d]
    p_ = pays[(pays.bd <= d) & pays.sid.isin(s_.sid)]
    rec.append(s_["tot"].sum() - p_["amt"].sum())
rec = pd.Series(rec, index=days_all)
assert abs(rec.iloc[-1] - owed) < 0.01
oct_end = rec.loc["2026-10-31"]
assert abs(oct_end - D["FIN_OCT_END"]["receivables"] / P) < 0.01
put("receivables_avg_daily", float(rec.mean()), "PHP", "mean of end-of-day receivables, 27 Oct - 26 Nov")
put("receivables_peak", float(rec.max()), "PHP", f"highest end-of-day receivables ({rec.idxmax():%d %b})")
dso_avg = rec.mean() / sales_per_day
put("dso_avg", float(dso_avg), "days", "average daily receivables / (net sales / 31)")
dso_steady = cs_val * vw_mean
put("dso_steady_state", float(dso_steady), "days", "credit share x value-weighted days to collect")
print(f"receivables: avg {peso(rec.mean())}, peak {peso(rec.max())} on {rec.idxmax():%d %b}, 31 Oct {peso(oct_end)}; "
      f"DSO avg {dso_avg:.2f}, steady state {dso_steady:.2f}")
# "Owed = N days of sales" with sales over the last 30 days (or since opening)
dos = []
for d in days_all:
    s30 = done[(done.bd > d - 30 * DAY) & (done.bd <= d)]["tot"].sum()
    n_days = min(30, (d - pd.Timestamp("2026-10-27")).days + 1)
    dos.append(rec.loc[d] / (s30 / n_days) if s30 > 0 else np.nan)
dos = pd.Series(dos, index=days_all)
last30 = done[done.bd > TODAY - 30 * DAY]
cs30 = last30[last30.pm == "unpaid"]["tot"].sum() / last30["tot"].sum()
put("credit_share_last_30_days", float(cs30), "share", "Not paid yet sales / net sales, 28 Oct - 26 Nov")
print(f"credit share, last 30 days: {cs30:.1%}")
put("owed_days_of_sales_today", float(dos.iloc[-1]), "days", "still owed / average daily net sales of the last 30 days")
put("owed_days_of_sales_p10", float(dos.quantile(0.1)), "days", "10th percentile of the daily series")
put("owed_days_of_sales_p90", float(dos.quantile(0.9)), "days", "90th percentile of the daily series")
print(f"owed in days of sales: today {dos.iloc[-1]:.1f}; daily series p10 {dos.quantile(.1):.1f}, "
      f"median {dos.median():.1f}, p90 {dos.quantile(.9):.1f}")

# ---------------------------------------------------------------------------------------------
# 4. FOLLOW-UP RULES (design method 9) AND THE SELF-MASKING TEST
# ---------------------------------------------------------------------------------------------
h("4. Follow-up thresholds")

def rule_paid_only(paid_days, open_ages=None):
    """Recommended: percentile_disc over sales paid in full; Very late at least a week after Late."""
    if len(paid_days) < 10:
        return dict(usual=7, late=7, very=30, guess=True)
    late = pdisc(paid_days, 0.8)
    return dict(usual=pdisc(paid_days, 0.5), late=late, very=max(pdisc(paid_days, 0.95), late + 7), guess=False)

def rule_v2(paid_days, open_ages):
    """Design v2 method 9: paid days plus open balances older than the paid median, at their current age."""
    if len(paid_days) < 10:
        return dict(usual=7, late=7, very=30, guess=True)
    med = pdisc(paid_days, 0.5)
    vals = list(paid_days) + [a for a in open_ages if a > med]
    late = pdisc(vals, 0.8)
    return dict(usual=pdisc(vals, 0.5), late=late, very=max(pdisc(vals, 0.95), late + 7), guess=False)

def rule_km(paid_days, open_ages):
    """Kaplan-Meier quantiles; when 95% is never reached, Very late = Late + 7."""
    if len(paid_days) < 10:
        return dict(usual=7, late=7, very=30, guess=True)
    k = kaplan_meier(list(paid_days) + list(open_ages), [1] * len(paid_days) + [0] * len(open_ages))
    late = km_quantile(k, 0.8) or max(paid_days)
    p95 = km_quantile(k, 0.95)
    return dict(usual=km_quantile(k, 0.5), late=late, very=max(p95 or 0, late + 7), guess=False)

RULES = {"fixed (SOP 9 / Finance)": None, "design v2": rule_v2, "paid only (recommended)": rule_paid_only,
         "Kaplan-Meier": rule_km}
live = {}
for name, f in RULES.items():
    r = dict(usual=7, late=7, very=30, guess=True) if f is None else f(pdays, ages)
    live[name] = r
    late_amt = openb[(openb.age > r["late"]) & (openb.age <= r["very"])]["bal"].sum()
    vl_amt = openb[openb.age > r["very"]]["bal"].sum()
    flag_paid = float((arr > r["late"]).mean())
    print(f"{name:28s} usual {r['usual']:>2} late after {r['late']:>2} very late after {r['very']:>2} | "
          f"owed: usual {peso(owed-late_amt-vl_amt)}, late {peso(late_amt)}, very late {peso(vl_amt)} | "
          f"normal payers it would have marked Late: {flag_paid:.0%}")
    key = name.split(" (")[0].replace(" ", "_").replace("-", "_").lower()
    put(f"rule_{key}_late_after", r["late"], "days", f"{name}: Late = owed longer than this")
    put(f"rule_{key}_very_late_after", r["very"], "days", f"{name}: Very late = owed longer than this")
    put(f"rule_{key}_paid_sales_marked_late", flag_paid, "share",
        f"{name}: share of the 31 paid-in-full sales that were still owed past Late's start")
    put(f"rule_{key}_paid_sales_marked_late_n", int((arr > r["late"]).sum()), "sales",
        f"{name}: number of the 31 paid-in-full sales that would have shown Late before being paid")
REC = live["paid only (recommended)"]

# Self-masking: the two 16-day balances stay unpaid; the four younger open sales are paid when 9 days old.
h("4b. Self-masking projection (two 16-day balances never paid; nothing else new)")
young = openb[openb.age < 16]
old = openb[openb.age >= 16]
proj = []
for k in range(0, 46):
    d = TODAY + k * DAY
    ages_now = (d - credit[~credit.paid_full]["bd"]).dt.days
    paid_extra = [9 for a in (d - young["bd"]).dt.days if a >= 9]
    open_now = [int(a) for a in (d - old["bd"]).dt.days] + [int(a) for a in (d - young["bd"]).dt.days if a < 9]
    pd_now = pdays + paid_extra
    row = {"day": d}
    for name in ("design v2", "paid only (recommended)", "Kaplan-Meier"):
        r = RULES[name](pd_now, open_now)
        a = int((d - old["bd"]).dt.days.iloc[0])
        row[name] = "Very late" if a > r["very"] else ("Late" if a > r["late"] else "Usual")
        row[name + " very"] = r["very"]
    row["age"] = int((d - old["bd"]).dt.days.iloc[0])
    proj.append(row)
proj = pd.DataFrame(proj)
for name in ("design v2", "paid only (recommended)", "Kaplan-Meier"):
    vl = proj[proj[name] == "Very late"]
    first = f"{vl.day.iloc[0]:%d %b} (age {vl.age.iloc[0]})" if len(vl) else "never (to 10 Jan, age 61)"
    print(f"{name:28s} first Very late: {first}")
    key = name.split(" (")[0].replace(" ", "_").replace("-", "_").lower()
    put(f"selfmask_{key}_first_very_late_age", int(vl.age.iloc[0]) if len(vl) else None, "days",
        "age at which a never-paid 16-day balance is first marked Very late (none = never within 45 days)")
print(proj[["day", "age", "design v2", "design v2 very", "paid only (recommended)", "Kaplan-Meier"]]
      .iloc[[0, 3, 4, 5, 10, 20, 45]].to_string(index=False))

# How many stuck balances blind design v2's Late? k open balances at 30 days with the 31 paid days
for k in range(1, 15):
    r = rule_v2(pdays, [30] * k)
    if r["late"] >= 30:
        put("v2_stuck_balances_to_hide_late", k, "balances",
            "open balances aged 30 days needed before design v2's Late start reaches 30 (none flagged)")
        print(f"design v2: {k} balances stuck at 30 days push Late's start to {r['late']} days, so none is Late "
              f"(today 6 sales are open)")
        break

# Precision of Late's start as collections accumulate (bootstrap from the shop's own 31)
h("4c. How precise Late's start is, by number of paid sales (bootstrap)")
prec = {}
for n in (31, 60, 120, 240):
    sims = [pdisc(list(RNG.choice(arr, size=n, replace=True)), 0.8) for _ in range(4000)]
    lo, hi = np.percentile(sims, [5, 95])
    prec[n] = (int(lo), int(hi))
    put(f"late_start_90pct_range_n{n}", f"{int(lo)}-{int(hi)}", "days", f"5th-95th pct of p80 over {n} paid sales")
print("90% range of Late's start (p80):", prec)

# ---------------------------------------------------------------------------------------------
# 5. PER-BUYER RULES: BACKTEST ON THE 37 CREDIT SALES (no look-ahead)
# ---------------------------------------------------------------------------------------------
h("5. Per-buyer warnings, backtest")
cr = credit.sort_values("ts").reset_index(drop=True)
pay_ts = pays.sort_values("ts")

def outstanding(sid, total, t):
    return total - pay_ts[(pay_ts.sid == sid) & (pay_ts.ts <= t)]["amt"].sum()

rows = []
for i, s in cr.iterrows():
    t = s.ts
    prior = cr[(cr.bk == s.bk) & (cr.ts < t)]
    prior_open = []
    for _, p in prior.iterrows():
        o = outstanding(p.sid, p.tot, t)
        if o > 0.005:
            prior_open.append((p, o))
    prior_paid = [p for _, p in prior.iterrows() if outstanding(p.sid, p.tot, t) <= 0.005]
    # shop-wide history known at time t
    paid_before = [int((last_pay[p.sid] - p.bd).days) for _, p in cr[cr.ts < t].iterrows()
                   if outstanding(p.sid, p.tot, t) <= 0.005]
    late_after = rule_paid_only(paid_before)["late"]
    usual_ticket = float(np.median(cr[cr.ts < t]["tot"])) if (cr.ts < t).any() else s.tot
    limit = max(p.tot for p in prior_paid) if prior_paid else max(usual_ticket, 340.0 if s.batch == 2 else 320.0)
    open_amt = sum(o for _, o in prior_open)
    oldest_age = max(((t.normalize() - p.bd).days for p, _ in prior_open), default=None)
    rows.append(dict(sid=s.sid, ts=t, tot=s.tot, stacked=open_amt > 0, open_amt=open_amt,
                     first_time=len(prior) == 0, settled_before=len(prior_paid),
                     over_limit=open_amt + s.tot > limit + 0.005, late_open=oldest_age is not None and oldest_age > late_after,
                     paid_full=bool(s.paid_full), days=s.days if s.paid_full else np.nan,
                     age=s.age, late_after_then=late_after))
bt = pd.DataFrame(rows)
# limit counted in pieces (prices moved from P320 to P340 between batches, which trips a peso limit):
# owed pieces + this sale's pieces > the most pieces the buyer has repaid on one sale (new buyer: 1 piece)
pcs_of = credit.set_index("sid")["pieces"].to_dict()
over_pcs = []
for _, r in bt.iterrows():
    s = cr[cr.sid == r.sid].iloc[0]
    prior = cr[(cr.bk == s.bk) & (cr.ts < r.ts)]
    open_pcs = sum(pcs_of[p.sid] for _, p in prior.iterrows() if outstanding(p.sid, p.tot, r.ts) > 0.005)
    repaid_pcs = [pcs_of[p.sid] for _, p in prior.iterrows() if outstanding(p.sid, p.tot, r.ts) <= 0.005]
    over_pcs.append(open_pcs + pcs_of[r.sid] > (max(repaid_pcs) if repaid_pcs else 1))
bt["over_limit_pcs"] = over_pcs
bt["warn"] = bt.stacked | bt.over_limit | bt.late_open
n_cr = len(bt)
summary = {}
for name, mask in [("already owes (stacked)", bt.stacked), ("over limit", bt.over_limit),
                   ("over limit, in pieces", bt.over_limit_pcs), ("has a Late balance", bt.late_open),
                   ("any warning", bt.warn), ("no warning", ~bt.warn)]:
    sub = bt[mask]
    pd_ = sub[sub.paid_full]["days"]
    summary[name] = dict(n=len(sub), value=sub.tot.sum(), paid=len(pd_), median_days=float(pd_.median()) if len(pd_) else None,
                         slow_share=float((pd_ > REC["late"]).mean()) if len(pd_) else None,
                         still_open=int((~sub.paid_full).sum()), open_value=float(sub[~sub.paid_full].tot.sum()))
    print(f"{name:24s} n {len(sub):>2} value {peso(sub.tot.sum()):>8} | paid {len(pd_):>2} median days "
          f"{summary[name]['median_days']} slow(>{REC['late']}d) {summary[name]['slow_share']} | "
          f"still open {summary[name]['still_open']}")
put("backtest_stacked_sales", int(bt.stacked.sum()), "sales", "credit sales to a buyer who already owed at that moment")
put("backtest_stacked_value", float(bt[bt.stacked].tot.sum()), "PHP", "value of those sales")
put("backtest_over_limit_sales", int(bt.over_limit.sum()), "sales",
    "credit sales where owed + this sale > the buyer's largest fully repaid sale (new buyer: usual credit sale)")
put("backtest_over_limit_pcs_sales", int(bt.over_limit_pcs.sum()), "sales",
    "credit sales where owed pieces + this sale > most pieces the buyer repaid on one sale (new buyer: 1)")
put("backtest_over_limit_pcs_value", float(bt[bt.over_limit_pcs].tot.sum()), "PHP", "value of those sales")
put("backtest_late_open_sales", int(bt.late_open.sum()), "sales", "credit sales to a buyer with a Late balance then")
# buyers with enough history for their own "usually pays in N days"
settled = paid.groupby("bk")["days"].agg(["size", "median"])
put("buyers_with_3plus_settled", int((settled["size"] >= 3).sum()), "buyers", "buyers with 3+ credit sales paid in full")
put("settled_sales_from_those_buyers", int(settled[settled["size"] >= 3]["size"].sum()), "sales",
    "paid-in-full credit sales by buyers with 3+ of them")
own = settled[settled["size"] >= 3]["median"]
print(f"buyers with 3+ settled credit sales: {len(own)}; their own medians range {own.min()}-{own.max()} days "
      f"(shop median {np.median(arr)})")
put("own_median_min", float(own.min()) if len(own) else None, "days", "lowest own median among those buyers")
put("own_median_max", float(own.max()) if len(own) else None, "days", "highest own median among those buyers")
put("backtest_any_warning_sales", int(bt.warn.sum()), "sales", "credit sales that would have shown a warning")
put("backtest_open_now_with_warning", int((bt.warn & ~bt.paid_full).sum()), "sales",
    "of today's 6 open sales, how many would have shown a warning when made")
put("backtest_first_time_sales", int(bt.first_time.sum()), "sales", "credit sales that were the buyer's first purchase on credit")
fw = bt[bt.first_time & bt.paid_full]["days"]
rw = bt[~bt.first_time & bt.paid_full]["days"]
put("days_to_collect_median_first_time", float(fw.median()), "days", "buyer's first credit sale, paid in full")
put("days_to_collect_median_repeat", float(rw.median()), "days", "buyer's later credit sales, paid in full")
print(f"first-time credit sales: {int(bt.first_time.sum())}, median days {fw.median()}; later ones median {rw.median()}")

# Value of "settle the old tab before a new one on credit": cash that would have come in earlier
early = []
for _, r in bt[bt.stacked].iterrows():
    t = r.ts
    s = cr[cr.sid == r.sid].iloc[0]
    for _, p in cr[(cr.bk == s.bk) & (cr.ts < t)].iterrows():
        o = outstanding(p.sid, p.tot, t)
        if o > 0.005:
            # when was that outstanding amount actually paid? (open now: counted to today)
            later = pay_ts[(pay_ts.sid == p.sid) & (pay_ts.ts > t)]
            remaining = o
            for _, q in later.iterrows():
                take = min(remaining, q.amt)
                early.append((take, (q.bd - t.normalize()).days))
                remaining -= take
            if remaining > 0.005:
                early.append((remaining, (TODAY - t.normalize()).days))
early = pd.DataFrame(early, columns=["amt", "days_earlier"])
peso_days = float((early.amt * early.days_earlier).sum())
put("one_tab_rule_peso_days", peso_days, "peso-days", "old balances x days they stayed open after the buyer took more credit")
put("one_tab_rule_avg_cash_freed", peso_days / CAL_DAYS, "PHP", "same / 31 days = average cash that would have been in hand")
put("one_tab_rule_dso_cut", peso_days / CAL_DAYS / sales_per_day, "days", "same / average daily net sales")
print(f"one open tab rule: {peso(early.amt.sum())} of old balances were still open when the buyer took more credit, "
      f"for {peso_days:,.0f} peso-days = {peso(peso_days/CAL_DAYS)} more cash on average "
      f"({peso_days/CAL_DAYS/sales_per_day:.2f} days of DSO)")

# peak exposure per buyer over time
peak = []
for b, g in cr.groupby("bk"):
    events = sorted(set(g.ts.tolist() + pay_ts[pay_ts.sid.isin(g.sid)].ts.tolist()))
    mx = 0.0
    for t in events:
        o = sum(outstanding(p.sid, p.tot, t) for _, p in g[g.ts <= t].iterrows())
        mx = max(mx, o)
    peak.append(mx)
peak = np.array(peak)
put("peak_buyer_exposure_max", float(peak.max()), "PHP", "largest amount one buyer owed at any moment")
put("peak_buyer_exposure_median", float(np.median(peak)), "PHP", "median of each credit buyer's peak balance")
put("buyers_peak_over_one_piece", int((peak > 340.0).sum()), "buyers", "credit buyers who at some point owed more than one pod")
print(f"per-buyer peak owed: median {peso(np.median(peak))}, max {peso(peak.max())}, "
      f"{int((peak > 340).sum())} of {len(peak)} buyers owed more than one pod at some point")

# ---------------------------------------------------------------------------------------------
# 6. EXPECTED LOSS: PD x LGD x EAD
# ---------------------------------------------------------------------------------------------
h("6. Expected loss")
# PD by age bucket, Jeffreys / Krichevsky-Trofimov estimate (defaults + 0.5) / (resolved + 1).
# A sale "reached" a bucket if it was still unpaid at the bucket's first day. Defaults to date: 0.
DEFAULTS = 0
L, V = REC["late"], REC["very"]
reach = {"Usual": len(paid), "Late": int((arr > L).sum()), "Very late": int((arr > V).sum())}
pd_bucket = {k: (DEFAULTS + 0.5) / (n + 1) for k, n in reach.items()}
print("resolved sales that reached each bucket:", reach)
print("PD by bucket (Jeffreys):", {k: round(v, 4) for k, v in pd_bucket.items()})
for k, v in pd_bucket.items():
    put(f"pd_{k.replace(' ', '_').lower()}", v, "probability", f"(defaults + 0.5) / (paid sales that were still owed at the {k} start + 1)")

def beta_ppf(a, b, q, grid=200001):
    x = np.linspace(0, 1, grid)[1:-1]
    logpdf = (a - 1) * np.log(x) + (b - 1) * np.log1p(-x)
    pdf = np.exp(logpdf - logpdf.max())
    cdf = np.cumsum(pdf); cdf /= cdf[-1]
    return float(np.interp(q, cdf, x))

pd_base = pd_bucket["Usual"]
pd_base_u95 = beta_ppf(0.5, len(paid) + 0.5, 0.95)
put("pd_base", pd_base, "probability", "Jeffreys mean, 0 defaults in 31 resolved credit sales")
put("pd_base_upper95", pd_base_u95, "probability", "95th percentile of Beta(0.5, 31.5)")
put("pd_rule_of_three", 3 / len(paid), "probability", "3 / n upper bound with 0 events (Hanley & Lippman-Hand 1983)")
print(f"base PD {pd_base:.2%} (95% upper {pd_base_u95:.2%}; rule of three {3/len(paid):.1%})")

LGD = 1.0
def bucket(a):
    return "Very late" if a > V else ("Late" if a > L else "Usual")
openb["bucket"] = openb["age"].astype(int).map(bucket)
openb["pd"] = openb["bucket"].map(pd_bucket)
el_now = float((openb.bal * openb.pd * LGD).sum())
put("expected_loss_now", el_now, "PHP", "sum of open balance x PD(bucket) x LGD 100%")
put("expected_loss_now_share_owed", el_now / owed, "share", "expected loss / still owed")
print(openb.groupby("bucket").agg(n=("sid", "size"), ead=("bal", "sum"), pd=("pd", "first")).to_string())
print(f"EL now {peso(el_now)} ({el_now/owed:.1%} of what is owed); accounting loss if one P340 sale is never paid: "
      f"P340; cash out of pocket: {peso(LANDED_COST_POD)} (what the pod cost)")

# Monte Carlo: PD uncertain (posterior Beta per bucket), defaults independent given PD
N = 50000
draws = {k: RNG.beta(DEFAULTS + 0.5, reach[k] - DEFAULTS + 0.5, size=N) for k in reach}
loss = np.zeros(N)
for _, r in openb.iterrows():
    loss += r.bal * LGD * (RNG.random(N) < draws[r.bucket])
q50, q95, q99 = np.percentile(loss, [50, 95, 99])
put("loss_current_book_mean", float(loss.mean()), "PHP", "Monte Carlo mean, 50,000 trials")
put("loss_current_book_p95", float(q95), "PHP", "95th percentile")
put("loss_current_book_p99", float(q99), "PHP", "99th percentile")
put("prob_any_loss_current_book", float((loss > 0).mean()), "probability", "chance at least one open balance is never paid")
print(f"MC loss on today's book: mean {peso(loss.mean())}, P50 {peso(q50)}, P95 {peso(q95)}, P99 {peso(q99)}; "
      f"P(any loss) {(loss>0).mean():.1%}")

gp_to_date = net_sales - D["FIN_END"]["cogs"] / P
stress = {"largest buyer (P680)": openb.groupby("bk").bal.sum().max(),
          "both Late balances": float(openb[openb.bucket != "Usual"].bal.sum()),
          "everything owed": owed}
for k, v in stress.items():
    print(f"stress {k}: {peso(v)} = {v/gp_to_date:.1%} of gross profit to date, {v/(D['FIN_END']['net_profit']/P):.1%} of net profit")
    put(f"stress_{k.split(' (')[0].replace(' ', '_').lower()}", float(v), "PHP", f"loss if {k} is never paid")
put("gross_profit_to_date", gp_to_date, "PHP", "net sales - landed COGS")

# Expected loss on the flow of new credit sales
credit_per_day_now = credit["tot"].sum() / CAL_DAYS
full_shelf_per_day = 3.61 * 330.0 * cs_val
for label, per_day in [("now", credit_per_day_now), ("full shelf", full_shelf_per_day)]:
    el_m = pd_base * LGD * per_day * 30
    el_m_hi = pd_base_u95 * LGD * per_day * 30
    put(f"el_month_{label.replace(' ', '_')}", el_m, "PHP/month", f"PD {pd_base:.2%} x credit sales a month ({label})")
    put(f"el_month_{label.replace(' ', '_')}_upper95", el_m_hi, "PHP/month", f"PD {pd_base_u95:.2%} (95% upper)")
    print(f"EL on new credit, {label}: credit sales {peso(per_day*30)}/month -> {peso(el_m)}/month "
          f"({peso(el_m_hi)} at the 95% upper PD)")

# ---------------------------------------------------------------------------------------------
# 7. CASH COST OF CREDIT
# ---------------------------------------------------------------------------------------------
h("7a. Financing cost of the money tied up")
avg_rec = float(rec.mean())
for label, rate in [("bank-like 1%/month", 0.01), ("credit-card ceiling 3%/month", 0.03), ("5-6 lender 20%/month", 0.20)]:
    c = avg_rec * rate
    put(f"carry_cost_{rate:.2f}", c, "PHP/month", f"average receivables {avg_rec:,.0f} x {rate:.0%} a month")
    print(f"{label:30s}: {peso(c)}/month, {c/ (len(credit) * 30/31):.1f} per credit sale")
per_sale_fin = 330.0 * 0.03 * vw_mean / 30
per_sale_el = pd_base * 330.0
put("cost_per_credit_sale_fin_el", per_sale_fin + per_sale_el, "PHP",
    "P330 x 3%/month x value-weighted days/30 + base PD x P330")
print(f"per credit sale: financing {per_sale_fin:.1f} + expected loss {per_sale_el:.1f} = {per_sale_fin+per_sale_el:.1f}")

h("7b. Order timing: what credit does to the next order (deterministic, expected values)")
# value-weighted distribution of days to collect
pmf = paid.groupby("days")["tot"].sum()
pmf = (pmf / pmf.sum()).to_dict()

def cond_pmf(age):
    sub = {d: p for d, p in pmf.items() if d > age}
    tot = sum(sub.values())
    return {d - age: p / tot for d, p in sub.items()} if tot > 0 else {1: 1.0}

def cap_pmf(cap):
    out = {}
    for d, p in pmf.items():
        out[min(d, cap)] = out.get(min(d, cap), 0) + p
    return out

def projection(credit_share=cs_val, new_pmf=None, chase_now=False, order_cost=ORDER_COST, order_by=ORDER_BY,
               pay_on_pickup=False):
    new_pmf = new_pmf or pmf
    horizon = pd.date_range(TODAY + DAY, "2027-01-31")
    inflow = pd.Series(0.0, index=horizon)
    for _, r in openb.iterrows():                                   # today's open balances
        if chase_now:
            inflow[TODAY + 2 * DAY] += r.bal
        else:
            for k, p in cond_pmf(int(r.age)).items():
                d = TODAY + k * DAY
                if d in inflow.index:
                    inflow[d] += r.bal * p
    sell_days = B3_PODS / PACE                                       # Batch 3 pods
    for i in range(int(math.ceil(sell_days))):
        d = ARRIVE + i * DAY
        frac = min(1.0, sell_days - i)
        value = PACE * POD_PRICE * frac
        inflow[d] += value * (1 - credit_share)
        for k, p in new_pmf.items():
            dd = d + k * DAY
            if dd in inflow.index:
                inflow[dd] += value * credit_share * p
    cash = 340.0 + (inflow - RUN_COST_PER_DAY).cumsum()
    sellout = ARRIVE + pd.Timedelta(days=sell_days)
    pay_day = order_by + (pd.Timedelta(days=DELIVERY_DAYS) if pay_on_pickup else pd.Timedelta(0))
    ok = cash[(cash.index >= pay_day) & (cash >= order_cost)]
    t = ok.index[0] if len(ok) else None                             # day the cash covers the payment
    if pay_on_pickup:                                                # ordered on time; picked up when paid
        arrive4 = t
        order_on = order_by
    else:                                                            # paid at order: the order waits for cash
        arrive4 = t + pd.Timedelta(days=DELIVERY_DAYS) if t is not None else None
        order_on = t
    empty = max(0.0, (arrive4 - sellout) / DAY) if t is not None else None
    return dict(cash_on_order_by=float(cash[order_by]), cash_on_pay_day=float(cash[pay_day]), order_on=order_on,
                delay=(t - pay_day).days if t is not None else None, empty_days=empty,
                top_up=max(0.0, order_cost - float(cash[pay_day])),
                gp_lost=empty * GP_PER_EMPTY_DAY if empty is not None else None)

SCEN = {
    "S0 as now (73% credit, own timing)": dict(),
    "S1 every new sale paid at the till": dict(credit_share=0.0),
    "S2 half of sales on credit": dict(credit_share=0.5),
    "S3 credit, all paid within 7 days": dict(new_pmf=cap_pmf(7)),
    "S4 credit, all paid by Late's start": dict(new_pmf=cap_pmf(REC["late"])),
    "S5 as now, but today's P2,080 collected by 28 Nov": dict(chase_now=True),
}
res = {}
for name, kw in SCEN.items():
    r = projection(**kw)
    res[name] = r
    print(f"{name:52s} cash on 5 Dec {peso(r['cash_on_order_by']):>7} (top-up {peso(r['top_up']):>6}) | order on "
          f"{r['order_on']:%d %b} (+{r['delay']} d) | empty {r['empty_days']:.1f} d | GP lost {peso(r['gp_lost'])}")
base = res["S0 as now (73% credit, own timing)"]
for name, r in res.items():
    key = name.split(" ")[0].lower()
    put(f"timing_{key}_cash_5dec", r["cash_on_order_by"], "PHP", f"{name}: cash on the order-by day")
    put(f"timing_{key}_top_up", r["top_up"], "PHP", f"{name}: owner money needed on the order-by day to order in full")
    put(f"timing_{key}_delay_days", r["delay"], "days", f"{name}: days the full order waits for cash")
    put(f"timing_{key}_gp_lost", r["gp_lost"], "PHP", f"{name}: empty days x P354")
put("credit_cash_held_back_5dec", res["S1 every new sale paid at the till"]["cash_on_order_by"] - base["cash_on_order_by"],
    "PHP", "cash on 5 Dec with every new sale paid at the till minus as now")
for name, kw in [("S0p as now, supplier paid on pick-up", dict(pay_on_pickup=True)),
                 ("S1p no new credit, supplier paid on pick-up", dict(pay_on_pickup=True, credit_share=0.0))]:
    r = projection(**kw)
    res[name] = r
    print(f"{name:52s} cash on 12 Dec {peso(r['cash_on_pay_day']):>7} (top-up {peso(r['top_up']):>6}) | picked up "
          f"+{r['delay']} d after arrival | empty {r['empty_days']:.1f} d | GP lost {peso(r['gp_lost'])}")
    key = name.split(" ")[0].lower()
    put(f"timing_{key}_gp_lost", r["gp_lost"], "PHP", f"{name}: empty days x P354")
    put(f"timing_{key}_top_up", r["top_up"], "PHP", f"{name}: owner money needed on the pick-up day")
credit_cost_cycle = base["gp_lost"] - res["S1 every new sale paid at the till"]["gp_lost"]
put("credit_timing_cost_next_order", credit_cost_cycle, "PHP", "GP lost S0 - S1 on Batch 4 (waiting for the full order)")
print(f"credit's timing cost on Batch 4: {peso(credit_cost_cycle)} of gross profit "
      f"(vs expected bad debt on today's book {peso(el_now)})")
for c in (7214.0,):
    r0 = projection(order_cost=c); r1 = projection(order_cost=c, credit_share=0.0)
    print(f"  sensitivity, order P{c:,.0f}: as now +{r0['delay']} d / {peso(r0['gp_lost'])}; "
          f"no credit +{r1['delay']} d / {peso(r1['gp_lost'])}")
    put("timing_s0_gp_lost_order7214", r0["gp_lost"], "PHP", "S0 with a P7,214 order")
    put("timing_s1_gp_lost_order7214", r1["gp_lost"], "PHP", "S1 with a P7,214 order")
for ob in ("2026-12-04", "2026-12-06"):
    r0 = projection(order_by=pd.Timestamp(ob)); r1 = projection(order_by=pd.Timestamp(ob), credit_share=0.0)
    print(f"  sensitivity, order by {ob[-5:]}: as now {peso(r0['gp_lost'])}; no credit {peso(r1['gp_lost'])}")

h("7c. Money tied up in credit as the shop grows")
for label, pieces_day in [("recorded pace (60 pieces / 31 days)", 60 / 31), ("pace while in stock", PACE),
                          ("full shelf", 3.61)]:
    tied = dso_steady * pieces_day * 330.0
    put(f"tied_up_{pieces_day:.2f}", tied, "PHP", f"steady-state DSO {dso_steady:.2f} x {pieces_day:.2f} pieces x P330")
    print(f"{label:36s}: {peso(tied)} owed on average = {tied/LANDED_COST_POD:.0f} pods at landed cost, "
          f"{tied/ORDER_COST:.0%} of the next order")
for cap in (7, REC["late"]):
    capped = sum(min(d, cap) * p for d, p in pmf.items())
    dso_c = cs_val * capped
    freed = (dso_steady - dso_c) * sales_per_day
    put(f"cash_freed_cap{cap}", freed, "PHP", f"(steady DSO - DSO with every collection by day {cap}) x net sales a day")
    print(f"collect everything by day {cap}: value-weighted days {vw_mean:.2f} -> {capped:.2f}; DSO {dso_steady:.2f} -> "
          f"{dso_c:.2f}; frees {peso(freed)} now, {peso((dso_steady-dso_c)*3.61*330)} at full shelf")
per10 = 0.10 * vw_mean * sales_per_day
put("cash_freed_per_10pts_credit", per10, "PHP", "10 points of credit share moved to the till x value-weighted days x net sales a day")
print(f"each 10 points of credit share moved to the till frees about {peso(per10)} now")

# Break-even: when is credit worth giving?
h("7d. Break-even bad-debt rate")
# Textbook credit decision for a one-off sale that would otherwise not happen (stock would sit):
# give credit when p x price > cost, i.e. p > landed cost / price (time value left out: about P3 a sale)
p_star_no_sale = LANDED_COST_POD / POD_PRICE
put("credit_decision_p_star_if_no_sale", p_star_no_sale, "probability",
    "chance of being paid above which a one-off credit sale beats no sale: landed cost P171.60 / price P340")
print(f"if the buyer would not buy at all and the pod would sit: credit pays when the chance of being paid > "
      f"{p_star_no_sale:.1%} (landed cost / price)")
for inc in (0.0, 0.05, 0.10, 0.25, 0.50):
    pd_star = (inc * LANDED_MARGIN - per_sale_fin) / (330.0 * LGD)
    put(f"breakeven_pd_inc{int(inc*100)}", pd_star, "probability",
        f"(share of credit sales that need credit {inc:.0%} x P159.45 margin - P{per_sale_fin:.1f} financing) / P330")
    print(f"if {inc:.0%} of credit sales would not happen without credit: credit pays while PD < {pd_star:.1%}")

# ---------------------------------------------------------------------------------------------
# 8. WRITE METRICS
# ---------------------------------------------------------------------------------------------
out = os.path.join(HERE, "credit-and-collections_metrics.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(M, f, indent=1, ensure_ascii=False, default=str)
print(f"\nwrote {out} ({len(M)} metrics)")
