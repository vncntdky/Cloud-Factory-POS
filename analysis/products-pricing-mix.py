#!/usr/bin/env python3
"""Products, pricing and mix (branch 3 of 4) -- every number in products-pricing-mix.md comes from this script.

Run:  python3 analysis/products-pricing-mix.py        (numpy + pandas only, about 20 seconds)

Data: the read-only pull of 26 Nov 2026 18:59 Manila that analysis/baseline.py holds as its data block. This
script executes ONLY that data block (section 1 of baseline.py), so baseline.py's own outputs are not rewritten.
Live re-check at 19:45 Manila the same day: 51 completed sales, 60 pieces, ₱19,800, ₱0 discounts, 81 movements,
every sale line at the product's list price, all payments in cash, staff discount limit ₱50. Nothing had changed.

Writes one new file: analysis/products-pricing-mix_metrics.json (key figures with unit and formula).
Privacy: buyers are pseudonymous numbers in the data block; only counts are printed here.
"""
import json
import math
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------------------------
# 0. DATA: execute only the data block of baseline.py (everything before "# 2. FRAMES")
# ---------------------------------------------------------------------------------------------
_src = open(os.path.join(HERE, "baseline.py"), encoding="utf-8").read()
_cut = _src.rfind("# ----", 0, _src.index("# 2. FRAMES"))
D = {}
exec(compile(_src[:_cut], "baseline.py[data block]", "exec"), D)

AS_OF = D["AS_OF"]                      # 2026-11-26 18:59 Manila
P = 100.0                               # centavos per peso
DAY = pd.Timedelta(days=1)
CATEGORY = {"XBLACK MAX": "TRANSPARENT V2 PODS", "Black TEO": "Black TEO",
            "BLXCK Signature": "BLXCK Signature 88000", "Device": "Device"}   # live: one brand per category
LINE_BATCH = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
BATCH_ID = {v[0]: k for k, v in D["BATCHES"].items()}

prod = pd.DataFrame([(k, *v) for k, v in D["PRODUCTS"].items()], columns=["pid", "line", "flavour", "price", "cost"])
prod["batch"] = prod["line"].map(LINE_BATCH)
fees = {n: sum(D["BATCHES"][BATCH_ID[n]][3:]) for n in (1, 2, 3)}
pieces_in = {1: 30, 2: 30, 3: sum(q for _, q, _ in D["ORDER_LINES_B3"])}
fee_pp = {n: fees[n] / pieces_in[n] for n in fees}
prod["fee_pp"] = prod["batch"].map(fee_pp)
prod["landed"] = prod["cost"] + prod["fee_pp"]
prod["margin"] = prod["price"] - prod["landed"]          # landed margin a piece (centavos)
on_order = {pid: q for pid, q, _ in D["ORDER_LINES_B3"]}
prod["on_order"] = prod["pid"].map(on_order).fillna(0).astype(int)

sales = pd.DataFrame(D["SALES"], columns=["sid", "bd", "ts", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales["bd"] = pd.to_datetime(sales["bd"]); sales["ts"] = pd.to_datetime(sales["ts"])
done = sales[sales.status == "completed"].copy()
items = pd.DataFrame(D["ITEMS"], columns=["sid", "pid", "q", "up", "uc", "ltot"])
items = items.merge(sales[["sid", "status", "bd", "ts", "bk", "pm"]], on="sid").merge(prod, on="pid")
it = items[items.status == "completed"].copy()
moves = pd.DataFrame(D["MOVES"], columns=["pid", "kind", "delta", "bid", "ts"])
moves["ts"] = pd.to_datetime(moves["ts"])
moves = moves.sort_values("ts", kind="stable").reset_index(drop=True)

M = {}
def put(name, value, unit, formula):
    v = float(value) if isinstance(value, (np.floating, np.integer, float, int)) and not isinstance(value, bool) else value
    M[name] = dict(value=round(v, 4) if isinstance(v, float) else v, unit=unit, formula=formula, as_of="2026-11-26 18:59")
    return value
def h(t): print(f"\n=== {t} ===")
def peso(c): return c / P
def pct(x): return f"{100 * x:.1f}%"

# Checks against the fact base / finance_report
NET = done["tot"].sum(); PCS = it["q"].sum()
COGS_L = (it["q"] * it["landed"]).sum()
assert NET == 1980000 and PCS == 60 and done["disc"].sum() == 0
assert round(COGS_L) == 1023300, COGS_L
NP = NET - COGS_L - sum(e[2] for e in D["EXPENSES"])
assert round(NP) == 882700, NP
assert (it["up"] == it["price"]).all()                        # every line at list price
print("checks: net ₱19,800, 60 pcs, landed COGS ₱10,233, net profit ₱8,827, all lines at list price -> OK")

# ---------------------------------------------------------------------------------------------
# 1. STOCK TIMELINE: in-stock spells per product and for the shop (running sum of delta)
# ---------------------------------------------------------------------------------------------
def segments(ev, start, end):
    """ev: rows (ts, delta) sorted. Returns [(t0, t1, level)] from start to end."""
    out, lvl, t = [], 0, start
    for row in ev.itertuples():
        if row.ts > t:
            out.append((t, min(row.ts, end), lvl)); t = row.ts
        lvl += row.delta
    if end > t:
        out.append((t, end, lvl))
    return [(a, b, l) for a, b, l in out if b > a]

SEG = {}
for pid, g in moves.groupby("pid"):
    SEG[pid] = segments(g[["ts", "delta"]], g.ts.min(), AS_OF)
T0 = moves.ts.min()

def instock_days(pid, a=T0, b=AS_OF):
    return sum(max(0.0, (min(t1, b) - max(t0, a)) / DAY) for t0, t1, l in SEG.get(pid, []) if l > 0)

stocked = prod[prod.pid.isin(SEG)].copy()
stocked["instock_d"] = stocked.pid.map(instock_days)
first_in = moves[moves.delta > 0].groupby("pid").ts.min()
out_at = {pid: next((t0 for t0, t1, l in s if l <= 0), None) for pid, s in SEG.items()}
stocked["first_in"] = stocked.pid.map(first_in)
stocked["out_at"] = stocked.pid.map(out_at)
stocked["sellout_d"] = (stocked["out_at"] - stocked["first_in"]) / DAY
sold = it.groupby("pid").q.sum()
stocked["sold"] = stocked.pid.map(sold).fillna(0).astype(int)
stocked["speed_raw"] = stocked["sold"] / stocked["instock_d"]                     # pieces a day on the shelf
stocked["speed_unb"] = (stocked["sold"] - 1) / stocked["instock_d"]                # spell ends with the last sale: (n-1)/T
assert (stocked["sold"] == 3).all() and len(stocked) == 20

# shop: number of flavours in stock over time
events = moves[["ts", "pid", "delta"]].copy()
lvl = {p: 0 for p in prod.pid}
shop_seg, t, n = [], T0, 0
for row in events.itertuples():
    if row.ts > t:
        shop_seg.append((t, row.ts, n)); t = row.ts
    before = lvl[row.pid] > 0
    lvl[row.pid] += row.delta
    n += int(lvl[row.pid] > 0) - int(before)
shop_seg.append((t, AS_OF, n))
shop_seg = [(a, b, k) for a, b, k in shop_seg if b > a]
def open_days(a, b):
    return sum(max(0.0, (min(t1, b) - max(t0, a)) / DAY) for t0, t1, k in shop_seg if k > 0)
def flavour_days(a, b):
    return sum(max(0.0, (min(t1, b) - max(t0, a)) / DAY) * k for t0, t1, k in shop_seg)
OPEN = open_days(T0, AS_OF)
put("shop_days_with_stock", OPEN, "days", "time with >=1 piece on the shelf, 27 Oct 09:15 -> 26 Nov 18:59")
print(f"shop open {OPEN:.2f} days; flavour-days on the shelf {flavour_days(T0, AS_OF):.1f}")

# ---------------------------------------------------------------------------------------------
# 2. DESIGN v2 METHOD 3 REPLICA: top-down shop pace, flavour speed r_i shrunk to its category
# ---------------------------------------------------------------------------------------------
L_GUESS = 7.0
order_days = sorted({pd.Timestamp(D["BATCHES"][b][1]) if D["BATCHES"][b][1] else
                     pd.Timestamp(D["BATCHES"][b][2]) - pd.Timedelta(days=round(L_GUESS)) for b in D["BATCHES"]})
gaps = [(b - a).days for a, b in zip(order_days, order_days[1:])]
R = min(60, max(7, float(np.mean(gaps))))
H = min(56.0, max(21.0, 2 * R))                       # half-life (design v2: clamp(2R, 21, 56))
put("rhythm_days_v2", R, "days", "mean gap between order days (Batches 1, 2: arrival - 7 days)")
put("half_life_v2", H, "days", "clamp(2R, 21, 56)")
def age(ts): return (AS_OF - ts) / DAY
def w(ts): return 0.5 ** (age(ts) / H)
def wint(t1, t2): return (H / math.log(2)) * (0.5 ** (age(t2) / H) - 0.5 ** (age(t1) / H))

expo = {pid: sum(wint(a, b) for a, b, l in s if l > 0) for pid, s in SEG.items()}
it["w"] = it["ts"].map(w)
wsold = (it["w"] * it["q"]).groupby(it["pid"]).sum()
prod["expo"] = prod.pid.map(expo).fillna(0.0)
prod["wsold"] = prod.pid.map(wsold).fillna(0.0)
prod["category"] = prod["line"].map(CATEGORY)
shop_expo = sum(wint(a, b) for a, b, k in shop_seg if k > 0)
lam = prod["wsold"].sum() / shop_expo                                  # shop pace, pieces a day with stock
shop_rate = prod["wsold"].sum() / prod["expo"].sum()
line_rate = {}
for cat, g in prod.groupby("category"):
    if len(g) >= 2 and g["expo"].sum() > 0:
        line_rate[cat] = g["wsold"].sum() / g["expo"].sum()
prod["prior"] = prod["category"].map(line_rate).fillna(shop_rate)
K = 7.0
prod["r"] = (prod["wsold"] + K * prod["prior"]) / (prod["expo"] + K)
prod["in_plan"] = (prod["expo"] > 0) | (prod["on_order"] > 0)
prod["stocked"] = prod["expo"] > 0
prod["pace"] = np.where(prod["in_plan"], lam * prod["r"] / prod.loc[prod.in_plan, "r"].sum(), 0.0)
prod["value_pace"] = (prod["pace"] * prod["price"] / P).round()        # whole pesos a day (design v2)
prod["gp_pace"] = (prod["pace"] * prod["margin"] / P).round()          # same with landed margin
put("shop_pace_v2", lam, "pieces/day", "Σ w·sold ÷ ∫ w dt over time with stock, half-life H")
h("Design v2 pace replica")
print(f"R {R:.1f} d, H {H:.1f} d, shop pace λ {lam:.3f}/day, shop rate {shop_rate:.4f}, line rates "
      + ", ".join(f"{k} {v:.4f}" for k, v in line_rate.items()))
print(f"r range {prod.loc[prod.stocked, 'r'].min():.3f}-{prod.loc[prod.stocked, 'r'].max():.3f}; "
      f"pace range (31 in plan) {prod.loc[prod.in_plan, 'pace'].min():.3f}-{prod.loc[prod.in_plan, 'pace'].max():.3f}")

# ---------------------------------------------------------------------------------------------
# 3. PARETO / ABC under six rankings
# ---------------------------------------------------------------------------------------------
def abc_share_ahead(v):
    """Design v2 rule: class from the share of products strictly ahead; ties share a class."""
    v = np.asarray(v, dtype=float); tot = v.sum()
    ahead = np.array([v[v > x].sum() for x in v]) / tot if tot > 0 else np.zeros_like(v)
    return np.where(v <= 0, "C", np.where(ahead < 0.8, "A", np.where(ahead < 0.95, "B", "C")))
def n_for_80(v):
    s = np.sort(np.asarray(v, float))[::-1]
    return int(np.searchsorted(np.cumsum(s) / s.sum(), 0.8 - 1e-12) + 1)
def top_share(v, frac=0.2):
    s = np.sort(np.asarray(v, float))[::-1]; k = max(1, int(round(frac * len(s))))
    return s[:k].sum() / s.sum()
def gini(v):
    x = np.sort(np.asarray(v, float)); n = len(x)
    return (2 * np.sum(np.arange(1, n + 1) * x) / (n * x.sum())) - (n + 1) / n

st = stocked.merge(prod[["pid", "r", "pace", "value_pace", "gp_pace", "margin"]], on="pid", suffixes=("", "_p"))
st["net"] = st["sold"] * st["price"]
st["gp"] = st["sold"] * st["margin"]
st["gp_speed"] = st["speed_raw"] * st["margin"]
rank_views = {
    "net sales value": st["net"], "gross profit (landed)": st["gp"], "speed on the shelf (raw)": st["speed_raw"],
    "gross profit a day on the shelf": st["gp_speed"], "design v2 value pace (pace × price, ₱/day)": st["value_pace"],
    "value pace with landed margin (₱/day)": st["gp_pace"]}
h("Pareto / ABC (20 flavours that sold)")
print(f"{'ranking':46s} {'n for 80%':>9s} {'top 4 share':>11s} {'Gini':>5s} {'A/B/C (share-ahead rule)':>26s}")
abc_tab = {}
for k, v in rank_views.items():
    cls = abc_share_ahead(v); a, b, c = (cls == "A").sum(), (cls == "B").sum(), (cls == "C").sum()
    abc_tab[k] = dict(n80=n_for_80(v), top4=top_share(v), gini=gini(v), A=int(a), B=int(b), C=int(c))
    print(f"{k:46s} {n_for_80(v):9d} {pct(top_share(v)):>11s} {gini(v):5.2f} {f'{a} / {b} / {c}':>26s}")
put("pareto_n80_value", abc_tab["net sales value"]["n80"], "of 20", "flavours for 80% of net sales")
put("pareto_n80_gp", abc_tab["gross profit (landed)"]["n80"], "of 20", "flavours for 80% of landed gross profit")
put("pareto_n80_speed", abc_tab["speed on the shelf (raw)"]["n80"], "of 20", "flavours for 80% of in-stock speed")
put("pareto_top4_speed", abc_tab["speed on the shelf (raw)"]["top4"], "share", "top 20% of flavours, in-stock speed")
put("abc_v2_A", abc_tab["design v2 value pace (pace × price, ₱/day)"]["A"], "of 20", "class A under design v2")
cls_v = abc_share_ahead(st["value_pace"]); cls_g = abc_share_ahead(st["gp_pace"])
rho = pd.Series(st["value_pace"].values).rank().corr(pd.Series(st["gp_pace"].values).rank())
agree_vg = float((cls_v == cls_g).mean())
put("abc_value_vs_gp_class_agreement", agree_vg, "share", "same class under value pace and landed-margin pace")
print(f"value pace vs landed-margin pace: Spearman {rho:.3f}, same class for {pct(agree_vg)} of flavours")
conc = abc_tab["design v2 value pace (pace × price, ₱/day)"]["A"] <= 10
print(f"design v2 'Top seller' shown? A = {abc_tab['design v2 value pace (pace × price, ₱/day)']['A']} of 20 -> "
      f"{'yes' if conc else 'no (sales spread)'}")
gp_line = st.groupby("line").gp.sum() / st.gp.sum()
print("share of gross profit by line: " + ", ".join(f"{k} {pct(v)}" for k, v in gp_line.items()))
top = st.sort_values("speed_raw", ascending=False)[["line", "flavour", "sellout_d", "speed_raw", "speed_unb", "r",
                                                    "value_pace"]]
top["abc_v2"] = abc_share_ahead(top["value_pace"])
print("every flavour, fastest first (days to sell 3, raw and unbiased speed, design-v2 r, value pace ₱/day, class):")
print(top.to_string(index=False, float_format=lambda x: f"{x:.2f}"))
by_r = st.sort_values("r", ascending=False)
print("top 6 by design-v2 r: " + ", ".join(f"{a} ({b})" for a, b in zip(by_r.flavour.head(6), by_r.line.head(6))))
dash_ppp = (NET - (it["q"] * it["uc"]).sum()) / PCS / P
put("dashboard_profit_per_piece_unit_cost", dash_ppp, "PHP", "Dashboard: (net − Σ qty × unit cost) ÷ pieces")
print(f"Dashboard 'profit per piece' (unit cost, no restocking fees) ₱{dash_ppp:.2f} against Finance's landed "
      f"₱{(NET - COGS_L) / PCS / P:.2f}; margin {pct(1 - (it['q'] * it['uc']).sum() / NET)} against {pct(1 - COGS_L / NET)}")

# ---------------------------------------------------------------------------------------------
# 4. HOW STABLE ARE ABC CLASSES BUILT ON 3 PIECES A FLAVOUR? (Monte Carlo, 10,000 trials)
# ---------------------------------------------------------------------------------------------
rng = np.random.default_rng(20261126)
NSIM = 10000
LINES = st["line"].values
PRICE = st["price"].values / P
def estimate(tt, q, how):
    """Speed estimate from the days each flavour took to sell q pieces."""
    if how == "raw":
        return q / tt
    est = np.empty_like(tt)                                   # app-like: shrink to the line, k = 7 shelf-days
    for ln in np.unique(LINES):
        m = LINES == ln; prior = q * m.sum() / tt[m].sum()
        est[m] = (q + K * prior) / (tt[m] + K)
    return est
def sim_stability(true_r, label, how, q=3, nsim=NSIM):
    true_v = true_r * PRICE; true_cls = abc_share_ahead(true_v)
    truth_conc = (true_cls == "A").sum() <= len(true_r) / 2
    same_truth = np.empty(nsim); same_pair = np.empty(nsim); shown = 0; a_hit = []
    for s in range(nsim):
        t1 = rng.gamma(float(q), 1.0 / true_r); t2 = rng.gamma(float(q), 1.0 / true_r)   # two batches
        c1 = abc_share_ahead(estimate(t1, q, how) * PRICE); c2 = abc_share_ahead(estimate(t2, q, how) * PRICE)
        same_truth[s] = (c1 == true_cls).mean(); same_pair[s] = (c1 == c2).mean()
        if (c1 == "A").sum() <= len(true_r) / 2:
            shown += 1
            a_hit.append(((c1 == "A") & (true_cls == "A")).sum() / max(1, (c1 == "A").sum()))
    res = dict(truth_A=int((true_cls == "A").sum()), truth_concentrated=bool(truth_conc),
               same_as_truth=float(same_truth.mean()), same_next_batch=float(same_pair.mean()),
               top_seller_shown=shown / nsim, top_seller_right=float(np.mean(a_hit)) if a_hit else None)
    print(f"{label:52s} q={q:2d} truth A {res['truth_A']:2d} | class right {pct(res['same_as_truth']):>6s} | "
          f"same next batch {pct(res['same_next_batch']):>6s} | Top seller shown {pct(res['top_seller_shown']):>6s}"
          + (f", {pct(res['top_seller_right'])} of those labels on a true A" if res["top_seller_right"] is not None else ""))
    return res
h("ABC stability with 3 pieces a flavour (10,000 simulated pairs of batches)")
true_raw = st["speed_unb"].values                                 # widest plausible spread (unbiased, unshrunk)
true_shr = st["r"].values * (true_raw.mean() / st["r"].values.mean())   # design-v2 shrunk spread, same mean
stab = {}
for tname, tr in (("own speeds", true_raw), ("v2 shrunk speeds", true_shr)):
    for how in ("raw", "app"):
        stab[(tname, how)] = sim_stability(tr, f"truth = {tname}; ranked on {'raw 3/T' if how == 'raw' else 'app (shrunk, k=7)'}", how)
for q in (6, 12):   # more pieces per flavour sold: does it settle?
    r_ = sim_stability(true_raw, "truth = own speeds; ranked on app (shrunk, k=7)", "app", q=q, nsim=2000)
    put(f"abc_same_class_next_{q}pcs", r_["same_next_batch"], "share", f"simulated, {q} pieces sold per flavour")
app_own = stab[("own speeds", "app")]; app_shr = stab[("v2 shrunk speeds", "app")]
put("abc_same_class_next_batch_app", f"{min(app_own['same_next_batch'], app_shr['same_next_batch']):.3f}-"
    f"{max(app_own['same_next_batch'], app_shr['same_next_batch']):.3f}", "share", "app-like ranking, 3 pieces")
put("top_seller_false_alarm_app", f"{app_shr['top_seller_shown']:.3f}-{app_own['top_seller_shown']:.3f}", "share",
    "share of batches where 'Top seller' would show although the true spread is not concentrated")

# ---------------------------------------------------------------------------------------------
# 5. ABC -> SERVICE LEVELS (design v1) AGAINST ONE POOLED z (design v2)
# ---------------------------------------------------------------------------------------------
def norm_ppf(p):
    lo, hi = -8.0, 8.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if 0.5 * (1 + math.erf(mid / math.sqrt(2))) < p: lo = mid
        else: hi = mid
    return (lo + hi) / 2
LUMP = (it["q"] ** 2).sum() / it["q"].sum()
SIG_L = 1.75
def ss(rate, z, Ld=L_GUESS): return z * math.sqrt(Ld * rate * LUMP + rate ** 2 * SIG_L ** 2)
share20 = st["r"] / st["r"].sum()
pace20 = lam * share20.values                                       # re-ordering the same 20 flavours
cls20 = abc_share_ahead(st["value_pace"])
cls_v1 = abc_share_ahead(pace20 * st["price"].values)                # v1 used sales value; here value pace
Z = {"A": 1.96, "B": 1.645, "C": 1.28}
pooled = ss(lam, 1.645)
by_class = sum(ss(pace20[cls_v1 == c].sum(), Z[c]) for c in "ABC" if (cls_v1 == c).any())
by_class_one_z = sum(ss(pace20[cls_v1 == c].sum(), 1.645) for c in "ABC" if (cls_v1 == c).any())
flav_one_z = sum(ss(p, 1.645) for p in pace20)
flav_class_z = sum(ss(p, Z[c]) for p, c in zip(pace20, cls_v1))
per_flavour_v1 = sum(math.ceil(ss(p, Z[c])) for p, c in zip(pace20, cls_v1))
landed_pod = float(np.mean(prod.loc[prod.line != "Device", "landed"])) / P
h("Spare stock: one pooled z against z by ABC class")
print(f"lumpiness {LUMP:.3f}; L {L_GUESS:.0f} d, σ_L {SIG_L}; shop pace {lam:.2f}/day; classes on value pace "
      f"A {int((cls_v1 == 'A').sum())} / B {int((cls_v1 == 'B').sum())} / C {int((cls_v1 == 'C').sum())}")
steps_ss = [("pooled for the shop, z 1.645 (design v2)", pooled),
            ("pooled within each class, same z 1.645", by_class_one_z),
            ("pooled within each class, z 1.96 / 1.645 / 1.28", by_class),
            ("per flavour, z 1.645, not rounded", flav_one_z),
            ("per flavour, z by class, not rounded", flav_class_z),
            ("per flavour, z by class, rounded up (design v1)", per_flavour_v1)]
for k, v in steps_ss:
    print(f"   {k:50s} {v:5.1f} pcs  ({v - pooled:+5.1f}, ₱{(v - pooled) * landed_pod:+,.0f} at landed cost)")
print(f"   so: class z adds {by_class - by_class_one_z:+.1f} pcs; splitting the pool adds "
      f"{flav_one_z - pooled:+.1f}; rounding each flavour up adds {per_flavour_v1 - flav_class_z:+.1f}")
put("ss_class_z_effect_pcs", by_class - by_class_one_z, "pieces", "class z vs one z, pooled within class")
put("ss_pooled_pcs", pooled, "pieces", "1.645·√(L·λ·lump + λ²·σ_L²)")
put("ss_v1_per_flavour_pcs", per_flavour_v1, "pieces", "Σ ceil(z_class·√(L·pace_i·lump + pace_i²·σ_L²))")
put("ss_v1_extra_cash", (per_flavour_v1 - pooled) * landed_pod, "PHP", "extra pieces × average landed pod cost")
# Newsvendor critical ratio per line: is there an economic case for different service levels?
SWITCH = 0.15                                                       # stock-and-ordering branch fit
print("critical ratio Cu/(Cu+Co) by line (Cu = landed margin × 85% of buyers who leave):")
cr_rows = []
for line, g in prod.groupby("line"):
    m = g["margin"].mean() / P; c = g["landed"].mean() / P
    cu = m * (1 - SWITCH)
    for label, co in (("25%/yr holding, 18-day cycle", c * 0.25 * R / 365), ("10% a cycle (cash-short)", c * 0.10)):
        crr = cu / (cu + co); cr_rows.append((line, label, cu, co, crr, norm_ppf(crr)))
for line, label, cu, co, crr, z in cr_rows:
    print(f"   {line:16s} {label:30s} Cu ₱{cu:6.1f}  Co ₱{co:5.1f}  CR {pct(crr):>6s}  z {z:4.2f}")
pods_z = [z for line, label, *_rest, z in cr_rows if line != "Device"]
put("critical_ratio_z_range_pods", f"{min(pods_z):.2f}-{max(pods_z):.2f}", "z", "pods, both holding-cost cases")

# ---------------------------------------------------------------------------------------------
# 6. CONTRIBUTION MARGIN AND SHELF PRODUCTIVITY BY LINE
# ---------------------------------------------------------------------------------------------
h("Contribution margin and shelf productivity by line")
arrive = {1: pd.Timestamp("2026-10-27 09:15:05"), 2: pd.Timestamp("2026-11-09 19:55:50")}
last_sale = {n: it.loc[it.batch == n, "ts"].max() for n in (1, 2)}
rows = []
for n, line in ((1, "XBLACK MAX"), (2, "Black TEO")):
    g = st[st.line == line]; days = (last_sale[n] - arrive[n]) / DAY
    pcs = g["sold"].sum(); margin = g["margin"].mean() / P; gp = pcs * margin
    fdays = g["instock_d"].sum()
    # average inventory at landed cost while the batch sold
    tgrid = pd.date_range(arrive[n], last_sale[n], periods=4001)
    lvl_t = np.zeros(len(tgrid))
    for pid in g.pid:
        for t0, t1, l in SEG[pid]:
            mask = (tgrid >= t0) & (tgrid < t1); lvl_t[mask] += l
    avg_pcs = float(lvl_t.mean()); avg_inv = avg_pcs * g["landed"].mean() / P
    first24 = it[(it.batch == n) & (it.ts < arrive[n] + DAY)]["q"].sum()
    pace_ex = (pcs - first24) / (days - 1)
    rows.append(dict(line=line, price=g.price.iloc[0] / P, cost=g.cost.iloc[0] / P, fee_pp=g.fee_pp.iloc[0] / P,
                     landed=g.landed.iloc[0] / P, margin=margin, cm_pct=margin / (g.price.iloc[0] / P), pcs=pcs, gp=gp,
                     days=days, pace=pcs / days, gp_day=gp / days, flavour_days=fdays, gp_flavour_day=gp / fdays,
                     first24=first24, pace_ex=pace_ex, gp_day_ex=pace_ex * margin, avg_pcs=avg_pcs, avg_inv=avg_inv,
                     gmroi_cycle=gp / avg_inv, gmroi_30=gp / avg_inv * 30 / days))
LT = pd.DataFrame(rows).set_index("line")
print(LT[["price", "cost", "fee_pp", "landed", "margin", "cm_pct", "pcs", "gp", "days", "pace", "gp_day",
          "flavour_days", "gp_flavour_day"]].to_string(float_format=lambda x: f"{x:,.2f}"))
print(LT[["first24", "pace_ex", "gp_day_ex", "avg_pcs", "avg_inv", "gmroi_cycle", "gmroi_30"]]
      .to_string(float_format=lambda x: f"{x:,.2f}"))
xm, bt = LT.loc["XBLACK MAX"], LT.loc["Black TEO"]
for k in ("gp_day", "gp_flavour_day", "gp_day_ex", "gmroi_30"):
    put(f"line_{k}_xmax", xm[k], "PHP or x", k); put(f"line_{k}_bteo", bt[k], "PHP or x", k)
# What the app would show (recency-weighted like design v2: Σ w·sold·margin ÷ Σ weighted shelf-days, by category)
print("line scorecard as the engine would compute it (half-life H, by category):")
for cat, g in prod[prod.stocked].groupby("category"):
    gpw = (g["wsold"] * g["margin"]).sum() / P; ex = g["expo"].sum()
    raw_days = sum(instock_days(p) for p in g.pid)
    print(f"   {cat:22s} ₱{gpw / ex:6.2f} gross profit a day per flavour on the shelf (weighted); "
          f"{raw_days:5.1f} flavour-days on the shelf")
    put(f"line_gp_per_flavour_day_weighted_{g.line.iloc[0].replace(' ', '_')}", gpw / ex, "PHP/flavour-day",
        "Σ w·sold·landed margin ÷ Σ weighted shelf-days")
put("line_pace_ex_launch_xmax", xm["pace_ex"], "pieces/day", "first 24 h after arrival left out")
put("line_pace_ex_launch_bteo", bt["pace_ex"], "pieces/day", "first 24 h after arrival left out")
# Batch 3 lines (no sales yet): margin per piece and what they would earn at each known line's pace
for line in ("BLXCK Signature", "Device"):
    g = prod[prod.line == line]
    m = g["margin"].mean() / P
    print(f"{line:16s} price ₱{g.price.iloc[0] / P:.0f}, landed ₱{g.landed.iloc[0] / P:.2f}, margin ₱{m:.2f} "
          f"({pct(m / (g.price.iloc[0] / P))}); on order {int(g.on_order.sum())} pcs, ₱{(g.on_order * g.landed).sum() / P:,.0f} at landed cost")
blx_m = prod.loc[prod.line == "BLXCK Signature", "margin"].mean() / P
print(f"BLXCK at Black TEO's pace: ₱{bt['pace'] * blx_m:,.0f} gross profit a day; at XBLACK MAX's: ₱{xm['pace'] * blx_m:,.0f}")

# Does the ₱20 price gap explain the speed gap? Implied elasticity if it explained all of it.
gap_ratio = bt["pace_ex"] / xm["pace_ex"]
eps_implied = math.log(gap_ratio) / math.log(340 / 320)
put("implied_elasticity_if_price_explained_gap", eps_implied, "", "ln(pace BT / pace XMAX, ex launch) ÷ ln(340/320)")
print(f"Black TEO sold {pct(1 - gap_ratio)} slower (launch day left out). If the ₱20 price gap explained all of it, "
      f"elasticity would be {eps_implied:.1f}.")
for eps in (-0.4, -1.2, -1.6, -2.2):
    expl = (1 - (340 / 320) ** eps) / (1 - gap_ratio)
    print(f"   at elasticity {eps:+.1f} the price gap explains {pct(expl)} of the speed gap")
put("price_share_of_gap_at_eps_1_6", (1 - (340 / 320) ** -1.6) / (1 - gap_ratio), "share", "elasticity -1.6 (Huang 2018)")

# Same shelf fullness: pace and per flavour-day with 4-6 and 7-10 flavours of the line on the shelf
def pace_by_fullness(line, n):
    g = st[st.line == line]; pids = set(g.pid)
    lv = {p: 0 for p in pids}; t = arrive[n]; segs = []
    ev = moves[moves.pid.isin(pids)].sort_values("ts", kind="stable")
    k = 0
    for row in ev.itertuples():
        if row.ts > t:
            segs.append((t, row.ts, k)); t = row.ts
        b4 = lv[row.pid] > 0; lv[row.pid] += row.delta; k += int(lv[row.pid] > 0) - int(b4)
    segs.append((t, last_sale[n], k))
    out = {}
    for lo, hi in ((7, 10), (4, 6), (1, 3)):
        dd = sum((b - a) / DAY for a, b, kk in segs if lo <= kk <= hi and b > a)
        fd = sum((b - a) / DAY * kk for a, b, kk in segs if lo <= kk <= hi and b > a)
        # count each sale at the number of flavours on the shelf just before it
        q = 0
        for r_ in it[it.line == line].itertuples():
            kk = next((kk for a, b, kk in segs if a <= r_.ts - pd.Timedelta(seconds=1) < b), 0)
            q += r_.q if lo <= kk <= hi else 0
        out[f"{lo}-{hi}"] = (dd, q, q / dd if dd else float("nan"), q / fd if fd else float("nan"))
    return out
print("pace by how many of the line's flavours were on the shelf (days, pieces, a day, per flavour-day):")
for n, line in ((1, "XBLACK MAX"), (2, "Black TEO")):
    for k, (dd, q, pd_, pf) in pace_by_fullness(line, n).items():
        print(f"   {line:11s} {k:5s} {dd:5.2f} d {q:3.0f} pcs {pd_:5.2f}/day {pf:5.3f}/flavour-day")

# ---------------------------------------------------------------------------------------------
# 7. PRICE LEVERAGE, BREAK-EVEN VOLUME, ELASTICITY SCENARIOS, COST PASS-THROUGH
# ---------------------------------------------------------------------------------------------
h("Price leverage")
avg_price = NET / PCS / P; avg_landed = COGS_L / PCS / P; m_avg = avg_price - avg_landed
cm = m_avg / avg_price
pcs_month_now = PCS * 30 / 31                                # realised pieces per 30 days
pcs_month_instock = 2.22 * 30                                # if the shelf were never empty at the average pace
gp_month = pcs_month_now * m_avg
one_pct = 0.01 * avg_price * pcs_month_now
put("price_1pct_gp_per_month", one_pct, "PHP/month", "1% × ₱330 × 58.1 pieces")
put("price_1pct_gp_lift", 0.01 * avg_price / m_avg, "share", "1% ÷ landed contribution margin")
print(f"avg price ₱{avg_price:.2f}, landed cost ₱{avg_landed:.2f}, margin ₱{m_avg:.2f} ({pct(cm)}); "
      f"{pcs_month_now:.1f} pcs per 30 days -> GP ₱{gp_month:,.0f}")
print(f"1% price, volume held: +₱{one_pct:,.0f} a month = +{pct(0.01 * avg_price / m_avg)} of gross profit; "
      f"1% more pieces: +₱{0.01 * pcs_month_now * m_avg:,.0f}")
np_month = (NP / P) * 30 / 31
print(f"recorded net profit ₱{np_month:,.0f} a month -> 1% price = +{pct(one_pct / np_month)} of net profit "
      f"(benchmark from the toolkit: +8.7% at an 11.5% operating margin)")
for fixed in (0, 3000, 6000, 8000):
    op = gp_month - 716 - fixed
    print(f"   with ₱{fixed:>5,} a month of unrecorded rent/pay: operating profit ₱{op:>7,.0f}; "
          f"1% price = {'+' + pct(one_pct / op) if op > 0 else 'n/a (loss)'} of it")
print("break-even volume change (landed margin of the line):")
be = []
for line, price, margin in (("Black TEO / BLXCK ₱340", 340.0, float(bt["margin"])),
                            ("XBLACK MAX ₱320", 320.0, float(xm["margin"]))):
    mm = margin / price
    for dp in (+10, +20, -10, -20, -50):
        c = dp / price
        need = (-c / (mm + c)) if dp > 0 else (-c / (mm + c))   # Δvolume that keeps gross profit equal
        be.append((line, dp, need))
        print(f"   {line:22s} price {dp:+4d} ₱ ({pct(c):>6s}): volume can change by {pct(need):>7s} before gross profit drops")
put("staff_limit_50_volume_needed", -(-50 / 340) / (bt["margin"] / 340 - 50 / 340), "share",
    "a ₱50 discount on a ₱340 piece: c ÷ (m − c)")
print("+₱10 on ₱340 pods, gross profit change at published e-cigarette elasticities:")
scen = []
for eps in (-0.4, -1.2, -1.6, -2.2, -3.0):
    m340 = float(bt["margin"])
    vol = (350 / 340) ** eps
    gp_ratio = vol * (m340 + 10) / m340
    d_month = (gp_ratio - 1) * pcs_month_now * m340
    scen.append((eps, vol - 1, gp_ratio - 1, d_month))
    print(f"   elasticity {eps:+.1f}: pieces {pct(vol - 1):>6s}, gross profit {pct(gp_ratio - 1):>6s} = "
          f"₱{d_month:+,.0f} a month")
put("price_plus10_gp_month_eps_1_6", [s for s in scen if s[0] == -1.6][0][3], "PHP/month", "+₱10 at elasticity -1.6")
put("price_plus10_gp_month_eps_0", 10 * pcs_month_now, "PHP/month", "+₱10, volume held")
# Cost pass-through: the supplier's cost rises 5% (the vapor excise rises 5% each January, RA 11467)
c0, p0 = 165.0, 340.0; c1 = c0 * 1.05; fee = float(prod.loc[prod.line == "BLXCK Signature", "fee_pp"].iloc[0]) / P
m0 = p0 - c0 - fee; m1 = p0 - c1 - fee
print(f"supplier cost +5% (₱{c0:.0f} -> ₱{c1:.2f}): margin ₱{m0:.2f} -> ₱{m1:.2f} a piece "
      f"(-₱{(m0 - m1) * pcs_month_now:,.0f} a month); price to keep the peso margin ₱{p0 + (c1 - c0):.2f}, "
      f"to keep the margin % ₱{(c1 + fee) / (1 - m0 / p0):.2f}")
put("cost_plus5_gp_month", -(m0 - m1) * pcs_month_now, "PHP/month", "₱8.25 a piece × 58.1 pieces")

# ---------------------------------------------------------------------------------------------
# 8. POCKET PRICE WATERFALL AND DISCOUNT LEAKAGE
# ---------------------------------------------------------------------------------------------
h("Pocket price waterfall (average piece)")
owed = done["bal"].sum()
wf = [("List price", avg_price), ("− discounts", -done["disc"].sum() / PCS / P),
      ("− payment fees (every payment was cash)", 0.0), ("− bad debt written off", 0.0),
      ("= pocket price (earned)", avg_price), ("− still owed, not in hand yet", -owed / PCS / P),
      ("= cash in hand so far", avg_price - owed / PCS / P), ("− landed cost (goods + restocking fees)", -avg_landed),
      ("− expenses a piece", -740 / PCS), ("= net profit a piece", NP / PCS / P)]
for k, v in wf:
    print(f"   {k:44s} ₱{v:8.2f}")
put("pocket_cash_per_piece", avg_price - owed / PCS / P, "PHP", "(net − still owed) ÷ pieces")
lim = D["SETTINGS"].get("staff_discount_limit_cents", 5000) if "staff_discount_limit_cents" in D["SETTINGS"] else 5000
sales_month = len(done) * 30 / 31
for share in (0.1, 0.3):
    leak = share * sales_month * 50
    print(f"   if staff gave the ₱50 limit on {pct(share)} of sales: -₱{leak:,.0f} a month ({pct(leak / gp_month)} of gross profit)")
put("discount_leak_10pct_sales", 0.1 * sales_month * 50, "PHP/month", "10% of 49.4 sales a month × ₱50")

# ---------------------------------------------------------------------------------------------
# 9. BUYERS AND FLAVOURS: do repeat buyers stick to a flavour or a line? (counts only)
# ---------------------------------------------------------------------------------------------
h("Repeat buying (pseudonymous buyer numbers; counts only)")
bl = it.sort_values("ts")[["bk", "line", "flavour", "q", "sid", "ts"]]
nb = bl.bk.nunique(); rep = bl.groupby("bk").sid.nunique(); rep_b = rep[rep >= 2].index
both = bl[bl.bk.isin(rep_b)].groupby("bk").line.nunique()
eligible = [b for b in rep_b if bl[(bl.bk == b) & (bl.line == "XBLACK MAX")].shape[0] > 0]
print(f"{nb} buyers; {len(rep_b)} bought on 2+ sales; of them {int((both >= 2).sum())} bought both lines; "
      f"{len(eligible)} of the repeat buyers bought XBLACK MAX and {int(sum(1 for b in eligible if (bl[(bl.bk == b)].line == 'Black TEO').any()))} of those bought Black TEO later")
same_flav = diff_flav = 0
within = dict(same=0, diff=0); across = 0
for b, g in bl[bl.bk.isin(rep_b)].groupby("bk"):
    seen = set(); seen_lines = set()
    for sid, gg in g.groupby("sid", sort=False):
        fl = set(gg.flavour + "|" + gg.line); ln = set(gg.line)
        if seen:
            if fl & seen: same_flav += 1
            else: diff_flav += 1
            if ln & seen_lines:                                  # bought this line before
                within["same" if fl & seen else "diff"] += 1
            else:
                across += 1
        seen |= fl; seen_lines |= ln
print(f"repeat purchases: {same_flav} took a flavour the buyer had bought before, {diff_flav} a new one "
      f"({pct(diff_flav / max(1, same_flav + diff_flav))} new)")
print(f"   of those, inside a line the buyer had bought before: {within['same']} same flavour, {within['diff']} new "
      f"flavour; {across} were the buyer's first piece of a new line")
put("repeat_within_line_new_flavour", within["diff"] / max(1, within["same"] + within["diff"]), "share",
    "repeat purchases inside a known line that took a new flavour")
mixed = it.groupby("sid").agg(q=("q", "sum"), nf=("pid", "nunique"))
print(f"sales with 2+ pieces: {int((mixed.q >= 2).sum())} of {len(mixed)}; of those {int(((mixed.q >= 2) & (mixed.nf >= 2)).sum())} mixed flavours")
put("repeat_buyers_both_lines", int((both >= 2).sum()), "buyers", "repeat buyers who bought XBLACK MAX and Black TEO")
put("repeat_purchase_new_flavour_share", diff_flav / max(1, same_flav + diff_flav), "share", "next purchase took a flavour not bought before")

# ---------------------------------------------------------------------------------------------
# 10. MONTHLY PROFIT REVIEW: the MECE driver tree as a per-day bridge (October -> November so far)
# ---------------------------------------------------------------------------------------------
h("Profit bridge, a day: October (27-31) -> November (1-26, to 18:59)")
def period(a, b, d_from, d_to):
    g = it[(it.bd >= d_from) & (it.bd <= d_to)]
    s = done[(done.bd >= d_from) & (done.bd <= d_to)]
    ex = sum(e[2] for e in D["EXPENSES"] if d_from <= pd.Timestamp(e[0]) <= d_to)
    q = g.q.sum(); days = (b - a) / DAY
    return dict(days=days, open=open_days(a, b), fdays=flavour_days(a, b), q=q, gross=s["sub"].sum() / P,
                disc=s["disc"].sum() / P, net=s["tot"].sum() / P, goods=(g.q * g.cost).sum() / P,
                fees=(g.q * g.fee_pp).sum() / P, opex=ex / P, tax=0.0, diffs=0.0)
oct_ = period(pd.Timestamp("2026-10-27"), pd.Timestamp("2026-11-01"), pd.Timestamp("2026-10-27"), pd.Timestamp("2026-10-31"))
nov_ = period(pd.Timestamp("2026-11-01"), AS_OF, pd.Timestamp("2026-11-01"), pd.Timestamp("2026-11-26"))
for p_ in (oct_, nov_):
    p_["np"] = p_["net"] - p_["goods"] - p_["fees"] - p_["opex"] - p_["tax"] + p_["diffs"]
assert abs(oct_["np"] - 3648.80) < 0.01 and abs(nov_["np"] - 5178.20) < 0.01
def bridge(p1, p2):
    d1, d2 = p1["days"], p2["days"]
    per = lambda p, k: p[k] / p["days"]
    pr = lambda p: p["gross"] / p["q"]; dc = lambda p: p["disc"] / p["q"]
    gd = lambda p: p["goods"] / p["q"]; fe = lambda p: p["fees"] / p["q"]
    m1 = pr(p1) - dc(p1) - gd(p1) - fe(p1)
    o1, o2 = p1["open"] / d1, p2["open"] / d2                     # share of days with stock
    f1, f2 = p1["fdays"] / p1["open"], p2["fdays"] / p2["open"]   # flavours on the shelf while open
    q1, q2 = p1["q"] / p1["fdays"], p2["q"] / p2["fdays"]          # pieces per flavour-day
    Q2 = p2["q"] / d2
    eff = [("1a Days with stock", (o2 - o1) * f1 * q1 * m1),
           ("1b Flavours on the shelf", o2 * (f2 - f1) * q1 * m1),
           ("1c Sales per flavour on the shelf", o2 * f2 * (q2 - q1) * m1),
           ("2a Price and mix", Q2 * (pr(p2) - pr(p1))),
           ("2b Discounts", -Q2 * (dc(p2) - dc(p1))),
           ("3a Cost per piece (goods)", -Q2 * (gd(p2) - gd(p1))),
           ("3b Restocking fees per piece", -Q2 * (fe(p2) - fe(p1))),
           ("4a Expenses", -(per(p2, "opex") - per(p1, "opex"))),
           ("4b Tax estimate", -(per(p2, "tax") - per(p1, "tax"))),
           ("4c Stock count differences", per(p2, "diffs") - per(p1, "diffs"))]
    total = per(p2, "np") - per(p1, "np")
    assert abs(sum(v for _, v in eff) - total) < 1e-9
    return eff, total, dict(o1=o1, o2=o2, f1=f1, f2=f2, q1=q1, q2=q2, m1=m1, np1=per(p1, "np"), np2=per(p2, "np"))
eff, total, kk = bridge(oct_, nov_)
print(f"October: {oct_['days']:.2f} days, open {oct_['open']:.2f}, {kk['f1']:.2f} flavours on the shelf while open, "
      f"{kk['q1']:.3f} pcs per flavour-day, profit a piece ₱{kk['m1']:.2f}, net profit ₱{kk['np1']:.0f} a day")
print(f"November: {nov_['days']:.2f} days, open {nov_['open']:.2f}, {kk['f2']:.2f} flavours on the shelf while open, "
      f"{kk['q2']:.3f} pcs per flavour-day, net profit ₱{kk['np2']:.0f} a day")
for k, v in eff:
    print(f"   {k:36s} ₱{v:+8.2f} a day   ₱{30 * v:+9,.0f} per 30 days   {pct(v / total) if total else '':>7s} of the change")
print(f"   {'= change in net profit':36s} ₱{total:+8.2f} a day   ₱{30 * total:+9,.0f} per 30 days")
avail = eff[0][1] + eff[1][1]
print(f"   being in stock (1a + 1b) = ₱{avail:+.2f} a day = {pct(avail / total)} of the change; "
      f"sales per flavour (1c) = {pct(eff[2][1] / total)}")
put("bridge_oct_nov_availability_share", avail / total, "share", "(days with stock + flavours on the shelf) ÷ change")
for k, v in eff:
    put("bridge_oct_nov_" + k.split()[0], v, "PHP/day", k)
put("bridge_oct_nov_total", total, "PHP/day", "Nov − Oct net profit a day")

h("Batch bridge, totals: Batch 1 -> Batch 2 (each 30 pieces, both sold out)")
bs = D["BATCH_STATEMENTS"]
b1 = dict(q=30, net=bs[1]["net"] / P, goods=bs[1]["cogs_goods"] / P, fees=bs[1]["cogs_fees"] / P, opex=640.0)
b2 = dict(q=30, net=bs[2]["net"] / P, goods=bs[2]["cogs_goods"] / P, fees=bs[2]["cogs_fees"] / P, opex=100.0)
for b in (b1, b2): b["np"] = b["net"] - b["goods"] - b["fees"] - b["opex"]
m1b = (b1["net"] - b1["goods"] - b1["fees"]) / b1["q"]
bb = [("Pieces", (b2["q"] - b1["q"]) * m1b), ("Price and mix", b2["q"] * (b2["net"] / b2["q"] - b1["net"] / b1["q"])),
      ("Cost per piece (goods)", -b2["q"] * (b2["goods"] / b2["q"] - b1["goods"] / b1["q"])),
      ("Restocking fees", -(b2["fees"] - b1["fees"])), ("Expenses charged", -(b2["opex"] - b1["opex"]))]
assert abs(sum(v for _, v in bb) - (b2["np"] - b1["np"])) < 1e-9
for k, v in bb: print(f"   {k:28s} ₱{v:+8.2f}")
print(f"   = net profit ₱{b1['np']:,.0f} -> ₱{b2['np']:,.0f} ({b2['np'] - b1['np']:+,.0f})")
npd1, npd2 = b1["np"] / xm["days"], b2["np"] / bt["days"]
print(f"   per day on the shelf: net profit ₱{npd1:,.0f} -> ₱{npd2:,.0f} ({pct(npd2 / npd1 - 1)}); "
      f"gross profit ₱{xm['gp_day']:,.0f} -> ₱{bt['gp_day']:,.0f} ({pct(bt['gp_day'] / xm['gp_day'] - 1)})")
put("batch_np_per_shelf_day_b1", npd1, "PHP/day", "3,921 ÷ 10.39"); put("batch_np_per_shelf_day_b2", npd2, "PHP/day", "4,906 ÷ 16.64")

# ---------------------------------------------------------------------------------------------
# 11. NEW LINES, NEW FLAVOURS AND THE DEVICE: how big should a first order be?
# ---------------------------------------------------------------------------------------------
h("Sizing new items")
unb = st["speed_unb"]
print(f"pod flavour speed on the shelf (unbiased): slowest {unb.min():.3f}, median {unb.median():.3f}, "
      f"fastest {unb.max():.3f} pieces a day")
cycle = R
for label, rate in (("slowest pod flavour", unb.min()), ("median pod flavour", unb.median())):
    print(f"   at the {label}'s speed ({rate:.3f}/day): one {cycle:.0f}-day order cycle sells {rate * cycle:.1f}; "
          f"10 devices last {10 / rate:,.0f} days")
dev_l = float(prod.loc[prod.line == "Device", "landed"].iloc[0]) / P
blx_l = float(prod.loc[prod.line == "BLXCK Signature", "landed"].iloc[0]) / P
extra = 7 * dev_l
put("device_cash_on_order", 10 * dev_l, "PHP", "10 × (₱200 + ₱6.60 fee share)")
print(f"devices on order: ₱{10 * dev_l:,.0f} = {pct(10 * dev_l / 7214)} of Batch 3; 7 beyond a 3-piece test = ₱{extra:,.0f}"
      f" = {extra / blx_l:.1f} pods = ₱{extra / blx_l * blx_m:,.0f} of pod gross profit a cycle if those pods sell")
put("device_excess_pod_gp_per_cycle", extra / blx_l * blx_m, "PHP/cycle", "7 devices' cash as pods × pod margin")
# breadth: what share of a line's speed sits in its slowest 3 flavours (what dropping them would risk)
for line in ("XBLACK MAX", "Black TEO"):
    s_ = st[st.line == line].sort_values("speed_unb")["speed_unb"]
    sh = s_.head(3).sum() / s_.sum()
    print(f"   {line}: slowest 3 of 10 flavours = {pct(sh)} of the line's speed; dropping them loses about "
          f"{pct(sh * (1 - SWITCH))} of its sales (85% of their buyers leave)")

# ---------------------------------------------------------------------------------------------
# 12. WHAT EACH LEVER IS WORTH A MONTH (for the ranking in the write-up)
# ---------------------------------------------------------------------------------------------
h("Levers, ₱ gross profit a month (30 days)")
in_stock_days_month = 30 * OPEN / 31
line_gap_full = (xm["gp_flavour_day"] - bt["gp_flavour_day"])
lev = [
    ("Line choice: shelf at XBLACK MAX's ₱/day instead of Black TEO's (launch day out), all of it",
     (xm["gp_day_ex"] - bt["gp_day_ex"]) * in_stock_days_month),
    ("   same, if half the gap is real", 0.5 * (xm["gp_day_ex"] - bt["gp_day_ex"]) * in_stock_days_month),
    ("Price +₱10 on every piece, volume held", 10 * pcs_month_now),
    ("Price +₱10, elasticity -1.6", [s for s in scen if s[0] == -1.6][0][3]),
    ("1% price, volume held", one_pct),
    ("Device: 7 fewer devices, cash into pods (per cycle)", extra / blx_l * blx_m),
    ("Discounts at the ₱50 staff limit on 10% of sales (risk)", -0.1 * sales_month * 50),
    ("Supplier cost +5% not passed on (risk)", -(m0 - m1) * pcs_month_now),
    ("Class-based spare stock (v1): extra cash tied up (one-off)", -(per_flavour_v1 - pooled) * landed_pod),
]
for k, v in lev: print(f"   {k:76s} ₱{v:+8,.0f}")
put("lever_line_choice_month", (xm["gp_day_ex"] - bt["gp_day_ex"]) * in_stock_days_month, "PHP/month",
    "(₱/day XMAX − ₱/day BT, launch day out) × 26.2 in-stock days a month")

with open(os.path.join(HERE, "products-pricing-mix_metrics.json"), "w", encoding="utf-8") as f:
    json.dump(M, f, ensure_ascii=False, indent=1)
print(f"\nwrote analysis/products-pricing-mix_metrics.json ({len(M)} metrics)")
