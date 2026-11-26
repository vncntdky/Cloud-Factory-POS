#!/usr/bin/env python3
"""Cloud Factory -- engagement synthesis (strategy review). Every number in analysis/strategy-review.md that is not
quoted from a branch file is computed here, and every branch figure it relies on is listed in section F with its source.

Run:  python3 analysis/strategy-review.py        (a few seconds; numpy + pandas, no scipy)

Data: the read-only pull of 26 Nov 2026 18:59 Manila embedded in analysis/baseline.py. This script reads only the DATA
block of that file (it does not import or run it). Re-checked live, read-only, at 20:16 Manila the same day: 51 completed
sales, 60 pieces, PHP 19,800, PHP 2,080 owed, 36 later payments, 81 stock movements, Batch 3 still on the way, every
product at 0 pieces; finance_report: cash 340, receivables 2,080, on the way 7,214, net profit 8,827, safe 340.

Sections
  A  engine replay on live data: design v2 as written, the stock branch's variant, and the adopted parameters
  B  next-order estimate: v2's per-product rounding against order-up-to from the shop reorder point
  C  collections thresholds: v2 (open balances among the values) against v3 (paid in full only), self-masking test
  D  payout suggestion at 25 Nov 07:48 (just after Batch 3 was paid) and now: v2 rule against the adopted hold rule
  E  reconciliation of figures that differ between the branches
  F  value at stake (not additive) and the recommendation ranking (impact x feasibility)
  G  numbers used on the Help -> Planning page
Privacy: aggregates only; the data block holds pseudonymous buyer numbers, never names.
"""
import json
import math
import os
from collections import defaultdict

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "baseline.py")
src = open(SRC, encoding="utf-8").read()
data_block = src.split("# 2. FRAMES")[0]
data_block = data_block[: data_block.rfind("# ----")]          # stop before the FRAMES banner line
NS = {"pd": pd, "np": np, "json": json, "os": os, "defaultdict": defaultdict}
exec(compile(data_block, SRC, "exec"), NS)
PRODUCTS, BATCHES, SALES, ITEMS, MOVES = NS["PRODUCTS"], NS["BATCHES"], NS["SALES"], NS["ITEMS"], NS["MOVES"]
PAYMENTS, ORDER_LINES_B3, EXPENSES = NS["PAYMENTS"], NS["ORDER_LINES_B3"], NS["EXPENSES"]
AS_OF = pd.Timestamp("2026-11-26 18:59")
TODAY = pd.Timestamp("2026-11-26")
DAY = pd.Timedelta(days=1)
P = 100.0
M = {}


def put(k, v, note=""):
    M[k] = {"value": v, "note": note}
    return v


def h(t):
    print(f"\n{'=' * 110}\n{t}\n{'=' * 110}")


def peso(x):
    return f"PHP {x:,.0f}"


# ---------------------------------------------------------------------------------------------------------------
# frames
# ---------------------------------------------------------------------------------------------------------------
CATEGORY = {"XBLACK MAX": "TRANSPARENT V2 PODS", "Black TEO": "Black TEO", "BLXCK Signature": "BLXCK Signature 88000",
            "Device": "Device"}
prod = pd.DataFrame([(k, *v) for k, v in PRODUCTS.items()], columns=["pid", "line", "flavour", "price", "cost"])
prod["cat"] = prod.line.map(CATEGORY)
on_order = defaultdict(int)
for pid, q, c in ORDER_LINES_B3:
    on_order[pid] += q
sales = pd.DataFrame(SALES, columns=["sid", "bdate", "created", "status", "method", "sub", "disc", "total", "bal", "bk"])
sales["bdate"] = pd.to_datetime(sales.bdate)
sales["created"] = pd.to_datetime(sales.created)
items = pd.DataFrame(ITEMS, columns=["sid", "pid", "q", "price", "cost", "ltot"])
it = items.merge(sales[["sid", "created", "status"]], on="sid")
it = it[it.status == "completed"].copy()
pays = pd.DataFrame(PAYMENTS, columns=["sid", "amt", "pdate", "pcreated"])
pays["pdate"] = pd.to_datetime(pays.pdate)
pays["pcreated"] = pd.to_datetime(pays.pcreated)
mv = pd.DataFrame(MOVES, columns=["pid", "kind", "delta", "batch", "ts"])
mv["ts"] = pd.to_datetime(mv.ts)
mv = mv.reset_index().sort_values(["ts", "index"]).reset_index(drop=True)
stocked = set(mv[(mv.delta > 0) & mv.kind.isin(["opening", "restock"])].pid)

# per-product level segments and shop open segments
seg_p = defaultdict(list)              # pid -> [(t1, t2, level)]
level = defaultdict(int)
last_t = {}
for r in mv.itertuples():
    if r.pid in last_t:
        seg_p[r.pid].append((last_t[r.pid], r.ts, level[r.pid]))
    level[r.pid] += r.delta
    last_t[r.pid] = r.ts
for pid, t in last_t.items():
    seg_p[pid].append((t, AS_OF, level[pid]))
assert all(v == 0 for v in level.values()), "every product should be at 0 pieces"

shop_seg = []                          # (t1, t2, products with stock)
lv = defaultdict(int)
prev = None
for r in mv.itertuples():
    if prev is not None:
        shop_seg.append((prev, r.ts, sum(1 for v in lv.values() if v > 0)))
    lv[r.pid] += r.delta
    prev = r.ts
shop_seg.append((prev, AS_OF, sum(1 for v in lv.values() if v > 0)))
open_days_raw = sum((b - a) / DAY for a, b, n in shop_seg if n > 0)


def age(t):
    return (AS_OF - t) / DAY


def wint(t1, t2, H):
    """integral of 0.5^(age/H) from t1 to t2 (days)."""
    return (H / math.log(2)) * (0.5 ** (age(t2) / H) - 0.5 ** (age(t1) / H))


def largest_remainder(total, x, pace):
    """x: dict pid -> raw share of the total; ties go to the faster product, then pid."""
    fl = {p: math.floor(v) for p, v in x.items()}
    left = int(total - sum(fl.values()))
    order = sorted(x, key=lambda p: (-(x[p] - math.floor(x[p])), -pace[p], p))
    for p in order[:max(0, left)]:
        fl[p] += 1
    return fl


LUMP = float((it.q ** 2).sum() / it.q.sum())
FEE_AVG = (239 + 244 + 264) / 3.0               # last 3 batches' restocking fees, pesos
BATCH_AVG_PCS = (30 + 30 + 40) / 3.0


def fees_for(pcs):
    return 0.0 if pcs <= 0 else round(FEE_AVG * max(1.0, pcs / BATCH_AVG_PCS))


# ---------------------------------------------------------------------------------------------------------------
h("A. Engine replay on live data (26 Nov 18:59): v2 as written, stock branch variant, adopted")
# ---------------------------------------------------------------------------------------------------------------
def engine(L=7.0, sdl=1.75, R=14.5, H=None, k=7.0, z=1.645, usual_qty=3, label=""):
    H = min(56.0, max(21.0, 2 * R)) if H is None else H
    wsold = defaultdict(float)
    for r in it.itertuples():
        wsold[r.pid] += 0.5 ** (age(r.created) / H) * r.q
    expo = {p: sum(wint(a, b, H) for a, b, l in seg_p.get(p, []) if l > 0) for p in prod.pid}
    shop_ws = sum(wsold.values())
    shop_ex = sum(wint(a, b, H) for a, b, n in shop_seg if n > 0)
    lam = shop_ws / shop_ex
    shop_rate = sum(wsold.values()) / sum(expo.values())
    line_rate = {}
    for cat, g in prod.groupby("cat"):
        e = sum(expo[p] for p in g.pid)
        line_rate[cat] = (sum(wsold[p] for p in g.pid) / e) if (len(g) >= 2 and e > 0) else None
    r_ = {}
    for p in prod.itertuples():
        base = line_rate[p.cat] if line_rate[p.cat] is not None else shop_rate
        r_[p.pid] = (wsold[p.pid] + k * base) / (expo[p.pid] + k)
    in_plan = [p for p in prod.pid if expo[p] > 0 or on_order[p] > 0]
    sr = sum(r_[p] for p in in_plan)
    pace = {p: (lam * r_[p] / sr if p in in_plan else 0.0) for p in prod.pid}
    rop_shop = lam * L + z * math.sqrt(L * lam * LUMP + lam ** 2 * sdl ** 2)
    tgt_shop = lam * (L + R) + z * math.sqrt((L + R) * lam * LUMP + lam ** 2 * sdl ** 2)
    rop = largest_remainder(round(rop_shop), {p: rop_shop * pace[p] / lam for p in in_plan}, pace)
    tgt = largest_remainder(round(tgt_shop), {p: tgt_shop * pace[p] / lam for p in in_plan}, pace)
    pos = {p: 0 + on_order[p] for p in prod.pid}                      # on_hand 0, nothing reserved
    pos_shop = sum(min(pos[p], max(tgt[p], usual_qty)) for p in in_plan)
    pos_pods = sum(min(pos[p], max(tgt[p], usual_qty)) for p in in_plan if prod.set_index("pid").cat[p] != "Device")
    due = pd.Timestamp("2026-11-25") + pd.Timedelta(days=round(L))
    start = max(TODAY, due)                                            # shelf empty, an order on the way
    order_by = start + pd.Timedelta(days=math.floor((pos_shop - rop_shop) / lam))
    order_by_pods = start + pd.Timedelta(days=math.floor((pos_pods - rop_shop) / lam))
    status, sug = {}, {}
    for p in prod.pid:
        if p not in stocked:
            status[p], sug[p] = "new", 0
        elif p not in in_plan:
            status[p], sug[p] = "skip", 0
        elif pos[p] <= rop[p]:
            status[p], sug[p] = "order", max(0, tgt[p] - pos[p])
        elif pos[p] - pace[p] * R <= rop[p]:
            status[p], sug[p] = "soon", max(0, tgt[p] - pos[p])
        else:
            status[p], sug[p] = "ok", 0
    cost = prod.set_index("pid").cost / P
    pcs = sum(sug.values())
    goods = sum(sug[p] * cost[p] for p in prod.pid)
    fee = fees_for(pcs)
    # fits your money (v2 method 8): budget = spare cash + reserve + receivables usually paid by the order day
    budget = 340 + 0 + 2080
    landed = {p: cost[p] * (1 + fee / goods) for p in prod.pid} if goods > 0 else {}
    pieces = [(n, -pace[p], p) for p in prod.pid for n in range(1, sug[p] + 1)]
    cum, fit = 0.0, 0
    for n, _, p in sorted(pieces):
        if cum + landed[p] > budget:
            break
        cum += landed[p]
        fit += 1
    out = dict(label=label, L=L, sdl=sdl, R=R, H=H, lam=lam, rop_shop=rop_shop, spare=rop_shop - lam * L,
               tgt_shop=tgt_shop, pos_shop=pos_shop, pos_pods=pos_pods, start=start.date(), order_by=order_by.date(),
               order_by_pods=order_by_pods.date(), statuses=pd.Series(status).value_counts().to_dict(), pcs=pcs,
               goods=goods, fees=fee, total=goods + fee, fit_pcs=fit, fit_cost=cum, pace=pace, rop=rop, tgt=tgt,
               status=status, sug=sug, in_plan=in_plan, r=r_)
    print(f"{label:34s} R {R:4.1f} H {H:4.1f} | lambda {lam:.3f}/day | ROP_shop {rop_shop:5.2f} (spare {rop_shop - lam * L:4.2f})"
          f" target {tgt_shop:5.2f} | position {pos_shop} (pods only {pos_pods}) start {start.date()} -> order by {order_by.date()}"
          f" (pods only {order_by_pods.date()}) | statuses {out['statuses']} | suggest {pcs} pcs {peso(goods)} + fees"
          f" {peso(fee)} = {peso(goods + fee)} | fits PHP 2,420: {fit} pcs {peso(cum)}")
    return out


# v2 as written: order days of Batches 1-2 imputed as arrival - 7 -> 20 Oct, 2 Nov, 25 Nov -> gaps 13, 23 -> R 18
v2_days = [pd.Timestamp("2026-10-20"), pd.Timestamp("2026-11-02"), pd.Timestamp("2026-11-25")]
R_v2 = float(np.clip(np.mean([(b - a) / DAY for a, b in zip(v2_days, v2_days[1:])]), 7, 60))
# adopted: order day = coalesce(ordered_on, received_on) -> 27 Oct, 9 Nov, 25 Nov -> gaps 13, 16 -> R 14.5 (clamp 7-30)
ad_days = sorted({pd.Timestamp(v[1] or v[2]) for v in BATCHES.values()})
R_ad = float(np.clip(np.mean([(b - a) / DAY for a, b in zip(ad_days, ad_days[1:])]), 7, 30))
print(f"order days v2 (imputed) {[d.strftime('%d %b') for d in v2_days]} -> R {R_v2}; adopted {[d.strftime('%d %b') for d in ad_days]}"
      f" -> R {R_ad}; lumpiness {LUMP:.3f}; shop open {open_days_raw:.2f} days")
V2 = engine(R=R_v2, label="design v2 as written")
ST = engine(R=R_ad, H=28.0, label="stock branch (H fixed 28)")
AD = engine(R=R_ad, label="adopted (R 14.5, H = clamp(2R))")
for key, e in (("v2", V2), ("stock", ST), ("adopted", AD)):
    for f in ("R", "H", "lam", "rop_shop", "spare", "tgt_shop", "pos_shop", "pcs", "goods", "fees", "total", "fit_pcs"):
        put(f"engine_{key}_{f}", float(e[f]) if not isinstance(e[f], (int,)) else e[f])
    put(f"engine_{key}_order_by", str(e["order_by"]))
    put(f"engine_{key}_order_by_pods_only", str(e["order_by_pods"]))

# delivery-time blend (stock branch): L = max(1, (sum gaps + 7) / (n + 1)) -- how the first real orders move L
print("\ndelivery time after the first real orders (one pretend order at the 7-day guess):")
for gaps in ([5], [7], [10], [5, 6], [0], [5, 6, 7, 5]):
    n = len(gaps)
    L_blend = max(1.0, (sum(gaps) + 7) / (n + 1))
    L_plain = max(1.0, float(np.mean(gaps)))
    sd = max(0.25, math.sqrt((sum((g - L_blend) ** 2 for g in gaps) + 2 * (L_blend / 4) ** 2) / (n + 1)))
    print(f"   gaps {gaps}: blended L {L_blend:.2f} (plain mean {L_plain:.2f}), spread {sd:.2f}")
put("L_after_one_5day_order_blend", max(1.0, (5 + 7) / 2))

# each day of delivery time moves the order-by date by about a day; value of a day
GP_EMPTY_DAY_AVG, GP_EMPTY_DAY_FULL = 354.0, 576.0                 # baseline section 6
lam = AD["lam"]
print(f"each extra day of delivery time adds {lam:.2f} pieces to the reorder point = one day earlier order-by;"
      f" an empty day costs PHP {GP_EMPTY_DAY_AVG:.0f}-{GP_EMPTY_DAY_FULL:.0f} of gross profit")

# ---------------------------------------------------------------------------------------------------------------
h("B. Next-order estimate: v2 per-product rounding against order-up-to from the shop reorder point")
# ---------------------------------------------------------------------------------------------------------------
def next_order_up_to(e):
    pcs = round(e["tgt_shop"] - e["rop_shop"])
    stocked_plan = [p for p in e["in_plan"]]
    split = largest_remainder(pcs, {p: pcs * e["pace"][p] / e["lam"] for p in stocked_plan}, e["pace"])
    cost = prod.set_index("pid").cost / P
    goods = sum(split[p] * cost[p] for p in stocked_plan)
    return pcs, goods, fees_for(pcs), split


for key, e in (("v2", V2), ("adopted", AD)):
    pcs, goods, fee, split = next_order_up_to(e)
    put(f"next_order_up_to_{key}_pcs", pcs)
    put(f"next_order_up_to_{key}_total", goods + fee)
    print(f"{key:8s}: v2 rule (sum of per-product targets) {e['pcs']} pcs {peso(e['total'])}; order-up-to"
          f" round(target - ROP) = {pcs} pcs, goods {peso(goods)} + fees {peso(fee)} = {peso(goods + fee)}")
NEXT_ORDER = put("next_order_adopted_total", next_order_up_to(AD)[1] + next_order_up_to(AD)[2])
NEXT_PCS = next_order_up_to(AD)[0]

# ---------------------------------------------------------------------------------------------------------------
h("C. Collections thresholds: v2 (open balances among the values) against v3 (paid in full only)")
# ---------------------------------------------------------------------------------------------------------------
def pdisc(xs, q):
    xs = sorted(xs)
    return xs[max(0, math.ceil(q * len(xs)) - 1)]


credit = sales[(sales.status == "completed") & (sales.method == "unpaid")].copy()
last_pay = pays.groupby("sid").pdate.max()
paid_days, open_rows = [], []
for s in credit.itertuples():
    if s.bal == 0 and s.sid in last_pay.index:
        paid_days.append(int((last_pay[s.sid] - s.bdate) / DAY))
    elif s.bal > 0:
        open_rows.append((int((TODAY - s.bdate) / DAY), s.bal / P))


def thresholds(paid, open_ages, version):
    if len(paid) < 10:
        return 7, 7, 30, True
    med = pdisc(paid, 0.5)
    vals = paid + ([a for a in open_ages if a > med] if version == "v2" else [])
    usual, late = pdisc(vals, 0.5), pdisc(vals, 0.8)
    return usual, late, max(pdisc(vals, 0.95), late + 7), False


for version in ("v2", "v3"):
    u, la, vla, g = thresholds(paid_days, [a for a, _ in open_rows], version)
    usual_amt = sum(b for a, b in open_rows if a <= la)
    late_amt = sum(b for a, b in open_rows if la < a <= vla)
    vlate_amt = sum(b for a, b in open_rows if a > vla)
    put(f"collections_{version}", [u, la, vla])
    print(f"{version}: usual {u} days, Late after {la}, Very late after {vla} | owed: usual {peso(usual_amt)}, Late"
          f" {peso(late_amt)}, Very late {peso(vlate_amt)} | paid in full {len(paid_days)}, open {len(open_rows)}")
fixed7_flags = sum(1 for d in paid_days if d > 7)
v3_late = thresholds(paid_days, [], "v3")[1]
put("paid_flagged_by_7_day_rule", fixed7_flags)
put("paid_flagged_by_v3", sum(1 for d in paid_days if d > v3_late))
print(f"paid-in-full sales a fixed 7-day rule would have marked Late: {fixed7_flags} of {len(paid_days)};"
      f" v3 (Late after {v3_late}): {sum(1 for d in paid_days if d > v3_late)}")

# self-masking: the two oldest balances are never paid, the four younger ones are paid at 9 days
print("self-masking test (two 16-day balances never paid; the others paid at 9 days):")
stuck0 = sorted(a for a, _ in open_rows)[-2:]
young = sorted(a for a, _ in open_rows)[:-2]
for d in (0, 3, 5, 10, 45):
    paid_now = paid_days + [9 for a in young if a + d >= 9]
    open_now = [a + d for a in young if a + d < 9] + [a + d for a in stuck0]
    row = []
    for version in ("v2", "v3"):
        u, la, vla, g = thresholds(paid_now, open_now, version)
        state = "Very late" if stuck0[0] + d > vla else ("Late" if stuck0[0] + d > la else "Usual")
        row.append(f"{version}: Very late after {vla:2d} -> {state:9s}")
    print(f"   {(TODAY + pd.Timedelta(days=d)).strftime('%d %b')}, age {stuck0[0] + d:2d}: " + " | ".join(row))
    put(f"masking_day{d}", row)

# ---------------------------------------------------------------------------------------------------------------
h("D. Payout suggestion at 25 Nov 07:48 (Batch 3 just paid, reserve reset to 0) and now")
# ---------------------------------------------------------------------------------------------------------------
def open_balances_at(ts):
    rows = []
    for s in credit.itertuples():
        if s.created > ts:
            continue
        paid = pays[(pays.sid == s.sid) & (pays.pcreated <= ts)].amt.sum()
        bal = (s.total - paid) / P
        if bal > 0.005:
            rows.append((s.bdate, bal))
    return rows


def running_month(today):
    first = pd.Timestamp("2026-10-27")
    open_d = (today - first) / DAY + 1
    days = max(30, min(90, open_d))
    exp = sum(a / P for d, c, a, b in EXPENSES if c != "tax" and pd.Timestamp(d) > today - pd.Timedelta(days=days)
              and pd.Timestamp(d) <= today)
    return exp * 30 / days, open_d < 60


def collect_by(ts, collect_day, usual, very_late_after):
    today = ts.normalize()
    return sum(b for bd, b in open_balances_at(ts)
               if (collect_day - bd) / DAY > usual and (today - bd) / DAY <= very_late_after)


u3, la3, vla3, _ = thresholds(paid_days, [], "v3")
order_day = pd.Timestamp(AD["order_by"])
for ts in (pd.Timestamp("2026-11-25 07:48"), AS_OF):
    rows = open_balances_at(ts)
    print(f"open credit balances at {ts:%d %b %H:%M}: {len(rows)} sales, {peso(sum(b for _, b in rows))};"
          f" ages {sorted(int((ts.normalize() - bd) / DAY) for bd, _ in rows)}")
cases = [("25 Nov 07:48, just after Batch 3 was paid", pd.Timestamp("2026-11-25 07:48"), 4232.0, 4232.0, 0.0),
         ("26 Nov 18:59, now", AS_OF, 340.0, 340.0, 0.0)]
for name, ts, spare, safe, kept in cases:
    run_m, guess = running_month(ts.normalize())
    coll = collect_by(ts, order_day, u3, vla3)
    hold = max(0.0, NEXT_ORDER - kept - coll)
    v2_sugg = max(0.0, min(safe, spare - run_m))
    ad_sugg = max(0.0, min(safe, spare - hold - run_m))
    put(f"payout_{ts:%d%b}", dict(spare=spare, running=run_m, collect=coll, hold=hold, v2=v2_sugg, adopted=ad_sugg))
    print(f"{name}: spare {peso(spare)}, safe {peso(safe)}, running costs {peso(run_m)} a month (guess {guess});"
          f" next order {peso(NEXT_ORDER)}; owed then and usually paid by {order_day.date()}: {peso(coll)} -> hold"
          f" {peso(hold)} | v2 suggests {peso(v2_sugg)}, adopted suggests {peso(ad_sugg)} (actual payout 25 Nov: PHP 4,232)")
# largest payout on 25 Nov that still lets the fund pay the next order on its day, if collections arrive as usual
cash_after = 4232.0
print(f"with the adopted rule the most the 25 Nov form would have pre-filled is {peso(M['payout_25Nov']['value']['adopted'])};"
      f" the cash-and-capital simulation's 10%-risk limit was about PHP 500 when paying at order (PHP 3,750 on pick-up)")

# ---------------------------------------------------------------------------------------------------------------
h("E. Reconciliation of figures that differ between the branches")
# ---------------------------------------------------------------------------------------------------------------
recon = pd.DataFrame([
    ("Next order, pieces", "v1 draft (per-flavour build-up)", "497 pcs, PHP 80,770 goods", "maths review / stock branch"),
    ("Next order, pieces", "design v2 as written (R 18 imputed, H 36)", f"{V2['pcs']} pcs, {peso(V2['total'])}", "this script, = v2 live check"),
    ("Next order, pieces", "maths-review fix used by cash and credit", "37 pcs, PHP 6,224", "cash-and-capital A3"),
    ("Next order, pieces", "stock branch (R 14.5, H 28)", "36 pcs now / 33 next, PHP 5,693-5,815", "stock-and-ordering 4.2, 4.4"),
    ("Next order, pieces", "adopted (R 14.5, H 29)", f"{AD['pcs']} pcs now / {NEXT_PCS} next, {peso(AD['total'])} / {peso(NEXT_ORDER)}", "this script"),
    ("Order-by date", "stock branch", "Sat 5 Dec (pods only); Mon 7 Dec counting 3 devices", "stock-and-ordering 4.4"),
    ("Order-by date", "design v2 as written", str(V2["order_by"]), "this script"),
    ("Order-by date", "adopted", f"{AD['order_by']} ({AD['order_by_pods']} pods only)", "this script"),
    ("Order-by date", "cash Monte Carlo (order at reorder point)", "P10 3 Dec, P50 6 Dec, P90 11 Dec", "cash-and-capital 4.4"),
    ("Collections Late / Very late", "design v2", f"{M['collections_v2']['value'][1]} / {M['collections_v2']['value'][2]} days", "this script"),
    ("Collections Late / Very late", "credit branch v3 (adopted)", f"{M['collections_v3']['value'][1]} / {M['collections_v3']['value'][2]} days", "this script"),
    ("Fits your money", "v2 money check (PHP 2,420 budget)", f"{AD['fit_pcs']} pcs", "this script"),
    ("Fits your money", "stock branch (cash on the order-by day, simulated)", "14 pcs (16 with 5-day delivery)", "stock-and-ordering 4.4"),
    ("Batch 4 lost gross profit if it waits for cash", "cash / credit / stock", "PHP 1,199-1,950 / 1,588 / 1,942", "three branch models"),
], columns=["figure", "source", "value", "where"])
print(recon.to_string(index=False))

# ---------------------------------------------------------------------------------------------------------------
h("F. Value at stake (not additive) and the recommendation ranking")
# ---------------------------------------------------------------------------------------------------------------
# Branch inputs (quoted, not recomputed): stock-and-ordering 4.3 simulation, gross profit after fees a month
SIM = dict(sellout_as_now=6674, rop_as_now=10712, rop_keep_next=11144, rop_unlimited=11261, weekly_keep=11314)
lever_timing = SIM["rop_as_now"] - SIM["sellout_as_now"]
lever_keep = SIM["rop_keep_next"] - SIM["rop_as_now"]
lever_rest = SIM["rop_unlimited"] - SIM["rop_keep_next"]
put("lever_timing_month", lever_timing)
put("lever_keep_next_month", lever_keep)
put("lever_cash_rest_month", lever_rest)
print(f"gross profit a month (stock simulation): order at sell-out as now {peso(SIM['sellout_as_now'])} -> reorder point"
      f" with partial orders {peso(SIM['rop_as_now'])} (+{lever_timing:,}) -> also keep the next order's cost"
      f" {peso(SIM['rop_keep_next'])} (+{lever_keep:,}) -> unlimited cash {peso(SIM['rop_unlimited'])} (+{lever_rest:,})")
pct = (SIM["rop_keep_next"] / SIM["sellout_as_now"] - 1)
put("gp_uplift_pct", pct)
print(f"total uplift from timing + cash discipline: +{SIM['rop_keep_next'] - SIM['sellout_as_now']:,} a month (+{pct:.0%})")
nov_gp_30 = 5918 / 25.79 * 30
print(f"cross-check: November's real gross profit per 30 days {peso(nov_gp_30)} (stock branch: PHP 5,918 over 26 days)")

# ranking: monthly peso impact (low, mid, high) x feasibility weight; one-off items converted where stated
FEAS = {"high": 0.9, "medium": 0.6, "low": 0.3}
recs = [
    # id, short name, low, mid, high (PHP a month), feasibility, basis
    ("R1", "Order on the Order-by date, in whatever size the cash buys (Fits your money)", 3221, 4038, 4706, "high",
     "stock sim with partial orders: as now 6,674 -> 10,712; tests +3,221 to +4,706 (+7,659 at Batch 1 demand);"
     " waiting for a full Batch 4 instead costs 1,234-6,728 on that cycle"),
    ("R3", "Hold the next order before any payout (suggested payout + notice)", 432, 700, 1575, "high",
     "+432 a month steady state on top of R1 (stock sim); 1,199-1,950 per cycle in which a payout follows an order"
     " and the shop waits for cash (cash sim); fewer split orders (PHP 174 shipping each)"),
    ("R4", "Ask the supplier for pay on pick-up or part payment", 0, 600, 1177, "medium",
     "Batch 4 short risk 100% -> 17%; lost GP 1,199 -> 22 per cycle; frees PHP 2.4k-4.3k of working capital"),
    ("R5", "Test re-ordering XBLACK MAX's fastest flavours next to BLXCK", 0, 1590, 3181, "medium",
     "(356 - 235) x 26.2 in-stock days = 3,181 if the whole line gap is real; 1,590 if half"),
    ("R6", "Record each order the day it is placed; tap Arrived the day it comes", 0, 354, 708, "high",
     "each day of delivery error ~ 1 day early or late ~ PHP 354 a cycle; spare stock 9 -> 7 pcs"),
    ("R7", "Collections from the shop's own payment times + 'already owes' at the till", 100, 300, 600, "high",
     "PHP 305 more cash on average (old tab first); PHP 481-898 freed by chasing from Late; one-off cash, not profit"),
    ("R8", "First week of a new batch: ask buyers to pay at the till while the supplier is paid at order", 0, 400, 1588, "medium",
     "Batch 4: PHP 1,588 lost as now vs 0 with no new credit, 880 at half credit; a substitute for R3/R4"),
    ("R9", "Pass supplier cost rises on to price, at least peso for peso", 0, 479, 958, "high",
     "PHP 479 a month for each 5% cost rise not passed on (8.25 x 58.1 pieces); excise +5% each January"),
    ("R10", "Lower the staff discount limit from PHP 50 to PHP 20", 0, 247, 740, "high",
     "exposure 247-740 a month if the PHP 50 limit were used on 10-30% of sales; PHP 0 used so far"),
    ("R12", "Owner's credit rule in SOP 9 (one open tab, Very late = no new credit)", 0, 9, 50, "high",
     "worst single balance seen 1,280 -> about 680 (PHP 600 less at risk); expected value about PHP 9"),
    ("R13", "Start new kinds of item at about 3; no device re-order until half have sold", 0, 300, 700, "high",
     "7 extra devices tie up PHP 1,446 = PHP 1,419 of pod gross profit a cycle"),
]
rk = pd.DataFrame(recs, columns=["id", "rec", "low", "mid", "high", "feasibility", "basis"])
rk["score"] = rk.mid * rk.feasibility.map(FEAS)
rk = rk.sort_values(["score", "high"], ascending=False).reset_index(drop=True)
rk["rank"] = rk.index + 1
print(rk[["rank", "id", "rec", "low", "mid", "high", "feasibility", "score"]].to_string(index=False))
put("ranking", rk[["rank", "id", "rec", "low", "mid", "high", "feasibility", "score"]].to_dict("records"))
print("\nnot additive: R3, R4 and R8 fix the same thing (cash on the order day) as R1's partial orders; R5's line gain"
      " interacts with R1 (a faster line makes on-time ordering worth more: +7,659 at Batch 1 demand).")
print("outside the ranking (no direct pesos, but every money rule depends on it): R11 record rent, pay and every running"
      " cost, and confirm the tax rate (at PHP 10k a month the first 31 days were a PHP 766 loss; 3% tax = PHP 594 to"
      " date, and the 25 Nov payout was PHP 584 over a 3% cap)")

# ROIC against an assumed cost of money (for the payout-vs-reinvest point)
roic_31 = 8827 / 5884
for rate_m, lab in ((0.01, "bank-like 1% a month"), (0.03, "card ceiling 3% a month"), (0.20, "'5-6' 20% a month")):
    print(f"ROIC {roic_31:.0%} per 31 days vs cost of money {lab}: economic profit on PHP 5,884 = "
          f"{peso(5884 * (roic_31 - rate_m * 31 / 30))} over the 31 days")
put("roic_31_days", roic_31)

# ---------------------------------------------------------------------------------------------------------------
h("G. Numbers used on the Help -> Planning page (adopted engine, 26 Nov)")
# ---------------------------------------------------------------------------------------------------------------
G = dict(pace_day=round(AD["lam"], 1), pace_week=round(AD["lam"] * 7), half_life_weeks=round(AD["H"] / 7),
         rop=round(AD["rop_shop"]), spare=round(AD["spare"]), sold_in_delivery=round(AD["lam"] * 7),
         target=round(AD["tgt_shop"]), next_pcs=NEXT_PCS, next_cost=round(NEXT_ORDER, -1), order_by=str(AD["order_by"]),
         order_by_pods=str(AD["order_by_pods"]), fit=AD["fit_pcs"], rhythm=R_ad, late=la3, very_late=vla3, usual=u3)
for k, v in G.items():
    print(f"   {k:16s} {v}")
put("planning_page_numbers", G)

json.dump(M, open(os.path.join(HERE, "strategy-review_metrics.json"), "w"), indent=1, default=str)
print("\nwrote analysis/strategy-review_metrics.json")
