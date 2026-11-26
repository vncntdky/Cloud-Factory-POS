#!/usr/bin/env python3
"""Cloud Factory -- branch 1 of 4: STOCK AND ORDERING. Every number in analysis/stock-and-ordering.md comes from here.

Run:  python3 analysis/stock-and-ordering.py          (about 1-3 minutes; numpy + pandas, no scipy)

Data: the read-only pull of 26 Nov 2026 18:59 Manila embedded in analysis/baseline.py. This script reads only
the DATA block of that file (it does not import or run it, so nothing there is rewritten). Live data was checked
again at 19:15 the same day: 51 completed sales, 60 pieces, 81 stock movements, Batch 3 still on the way, every
product at 0 pieces and reorder_at 5 -- unchanged.

Sections
  A  stock timeline facts (per flavour, shop, pace by how full the shelf was)
  B  the draft design's methods 1-7 run on live data as written, and the two fixes from the maths review
  C  demand model calibrated on Batches 1 and 2 (do buyers switch flavour or walk away?)
  D  order economics: restocking fee per order, holding cost, EOQ, cost of an empty day, service level
  E  the next order (Batch 4): when the plan wants it, when the shop's own cash allows it
  F  policy simulation: order at sell-out (today) vs reorder point vs weekly, with and without the cash limit
  G  flavour depth for a re-ordered line (flat 3-4 each vs by speed)
  H  low-stock alert, not-selling and batch-report rules (methods 7, 6, 10) on live data
Privacy: aggregates only; no buyer names (the data block has pseudonymous buyer numbers only).
"""
import math
import os
import re
import time
from collections import defaultdict

import numpy as np
import pandas as pd

T0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "baseline.py")
src = open(SRC, encoding="utf-8").read()
data_block = src.split("# 2. FRAMES")[0]
data_block = data_block[: data_block.rfind("# ----")]          # stop before the FRAMES banner line
NS = {"pd": pd, "np": np, "json": __import__("json"), "os": os, "defaultdict": defaultdict}
exec(compile(data_block, SRC, "exec"), NS)                   # defines PRODUCTS, BATCHES, SALES, ITEMS, MOVES ...
PRODUCTS, BATCHES, SALES, ITEMS, MOVES = NS["PRODUCTS"], NS["BATCHES"], NS["SALES"], NS["ITEMS"], NS["MOVES"]
PAYMENTS, ORDER_LINES_B3, FIN_END = NS["PAYMENTS"], NS["ORDER_LINES_B3"], NS["FIN_END"]
AS_OF = pd.Timestamp("2026-11-26 18:59")
TODAY = pd.Timestamp("2026-11-26")
DAY = pd.Timedelta(days=1)
P = 100.0
OUT = {}                                                     # headline numbers, printed at the end


def h(t):
    print(f"\n{'=' * 100}\n{t}\n{'=' * 100}")


def put(k, v):
    OUT[k] = v
    return v


# ------------------------------------------------------------------------------------------------------------------
# frames
# ------------------------------------------------------------------------------------------------------------------
prod = pd.DataFrame([(k, *v) for k, v in PRODUCTS.items()], columns=["pid", "line", "flavour", "price", "cost"])
LINE_BATCH = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
prod["batch"] = prod["line"].map(LINE_BATCH)
sales = pd.DataFrame(SALES, columns=["sid", "bd", "ts", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales["ts"] = pd.to_datetime(sales["ts"]); sales["bd"] = pd.to_datetime(sales["bd"])
items = pd.DataFrame(ITEMS, columns=["sid", "pid", "q", "up", "uc", "ltot"]).merge(
    sales[["sid", "status", "ts", "pm", "bd"]], on="sid")
it = items[items.status == "completed"].copy()
assert it.q.sum() == 60 and it.ltot.sum() == FIN_END["net"]
moves = pd.DataFrame(MOVES, columns=["pid", "kind", "delta", "bid", "ts"])
moves["ts"] = pd.to_datetime(moves["ts"])
moves = moves.sort_values("ts", kind="stable").reset_index(drop=True)
on_order = defaultdict(int, {pid: q for pid, q, _ in ORDER_LINES_B3})          # Batch 3, on the way
stocked = set(moves.loc[moves.delta > 0, "pid"])
fees_b = {1: 23900, 2: 24400, 3: 26400}
pcs_b = {1: 30, 2: 30, 3: 40}


def intervals(ev, start, end):
    out, lvl, t = [], 0, start
    for r in ev.itertuples():
        if r.ts > t:
            out.append((t, min(r.ts, end), lvl)); t = r.ts
        lvl += r.delta
    if end > t:
        out.append((t, end, lvl))
    return [(a, b, l) for a, b, l in out if b > a]


# ==================================================================================================================
h("A. Stock timeline facts")
# ==================================================================================================================
piv = {}
for pid, g in moves.groupby("pid"):
    piv[pid] = intervals(g[["ts", "delta"]], g.ts.min(), AS_OF)
fl = []
for pid, iv in piv.items():
    first = iv[0][0]
    zero = next((a for a, b, l in iv if l <= 0), None)
    instock = sum((b - a) / DAY for a, b, l in iv if l > 0)
    fl.append(dict(pid=pid, first=first, out=zero, instock=instock, sold=int(it.loc[it.pid == pid, "q"].sum())))
fl = pd.DataFrame(fl).merge(prod, on="pid")
fl["days_to_sell_out"] = (fl.out - fl.first) / DAY
fl["raw_pace"] = fl.sold / fl.instock
fl["unbiased_pace"] = (fl.sold - 1) / fl.instock            # Poisson: (n-1)/T is unbiased for the rate when T = time of the n-th sale
print(fl.sort_values(["batch", "days_to_sell_out"])[["line", "flavour", "sold", "days_to_sell_out", "raw_pace", "unbiased_pace"]]
      .round(2).to_string(index=False))
for line in ["XBLACK MAX", "Black TEO"]:
    d = fl[fl.line == line]
    put(f"sum_raw_pace_{line}", d.raw_pace.sum()); put(f"sum_unbiased_pace_{line}", d.unbiased_pace.sum())
    print(f"{line}: sum of raw flavour paces {d.raw_pace.sum():.2f}/day, unbiased (n-1)/T {d.unbiased_pace.sum():.2f}/day,"
          f" line sold 30 in {(d.out.max() - d.first.min()) / DAY:.2f} days = {30 / ((d.out.max() - d.first.min()) / DAY):.2f}/day")

# shop timeline and the number of flavours on the shelf
ev = []
for pid, g in moves.groupby("pid"):
    for r in g.itertuples():
        ev.append((r.ts, pid, r.delta))
ev.sort()
level = defaultdict(int)
seg = []                      # (t0, t1, n_flavours_in_stock, total_pieces)
t_prev = ev[0][0]
for ts, pid, d in ev + [(AS_OF, None, 0)]:
    if ts > t_prev:
        seg.append((t_prev, ts, sum(1 for v in level.values() if v > 0), sum(max(v, 0) for v in level.values())))
        t_prev = ts
    if pid:
        level[pid] += d
seg = pd.DataFrame(seg, columns=["t0", "t1", "nflav", "pieces"])
seg["days"] = (seg.t1 - seg.t0) / DAY
sale_ts = it[["ts", "q"]].copy()


def segment_of(ts):
    """flavours on the shelf just before a sale at ts (the sale itself is a movement at ts)."""
    m = seg[(seg.t0 < ts) & (seg.t1 >= ts)]
    return int(m.nflav.iloc[0]) if len(m) else 0


sale_ts["nflav"] = sale_ts.ts.apply(segment_of)
bands = [(7, 10), (4, 6), (1, 3)]
band_tab = []
for lo, hi in bands:
    dd = seg[(seg.nflav >= lo) & (seg.nflav <= hi)].days.sum()
    pp = sale_ts[(sale_ts.nflav >= lo) & (sale_ts.nflav <= hi)].q.sum()
    band_tab.append((f"{lo}-{hi}", dd, pp, pp / dd))
band_tab = pd.DataFrame(band_tab, columns=["flavours on shelf", "days", "pieces", "pieces/day"])
print(band_tab.round(2).to_string(index=False))
shop_open = seg[seg.pieces > 0].days.sum()
lam_any = 60 / shop_open
put("shop_open_days", shop_open); put("lam_any", lam_any)
# share of the current line on the shelf (current line = 10 flavours of the latest delivery)
for thr in (0.5, 0.7):
    dd = seg[seg.nflav >= thr * 10].days.sum()
    pp = sale_ts[sale_ts.nflav >= thr * 10].q.sum()
    put(f"lam_most_{int(thr * 100)}", pp / dd)
    print(f"pace while >= {thr:.0%} of the line was on the shelf: {pp} pcs / {dd:.2f} days = {pp / dd:.2f}/day")
fl_days = fl.instock.sum()
put("lam_full_noswitch", 60 / fl_days * 10)
print(f"pace on days with any stock (lambda_any) = 60 / {shop_open:.2f} = {lam_any:.2f}/day;"
      f"  per in-stock flavour-day {60 / fl_days:.3f} x 10 flavours = {60 / fl_days * 10:.2f}/day (no-switch upper bound)")
print(f"lines rotated: Batch 1 = XBLACK MAX, Batch 2 = Black TEO, Batch 3 = BLXCK Signature + device; flavours re-ordered so far: 0")

# ==================================================================================================================
h("B. The draft design's methods 1-7 on live data (as written), then the maths-review fixes")
# ==================================================================================================================
LUMP = float((it.q ** 2).sum() / it.q.sum())
L_GUESS, SDL_GUESS = 7.0, 7.0 / 4
order_days = sorted({pd.Timestamp(v[1] or v[2]) for v in BATCHES.values()})
gaps = [(b - a) / DAY for a, b in zip(order_days, order_days[1:])]
R_HIST = float(np.clip(np.mean(gaps), 7, 60))
print(f"lumpiness {LUMP:.3f}; order days {[d.strftime('%d %b') for d in order_days]} -> gaps {gaps} -> R = {R_HIST}")
put("R_hist", R_HIST)


def weighted(H):
    """per product: weighted sold, weighted in-stock exposure (days), with w = 0.5^(age/H). H=None -> unweighted."""
    def w(t):
        return 1.0 if H is None else 0.5 ** (((AS_OF - t) / DAY) / H)

    rows = {}
    for pid in prod.pid:
        sold = sum(w(r.ts) * r.q for r in it[it.pid == pid].itertuples())
        expo = 0.0
        for a, b, l in piv.get(pid, []):
            if l > 0:
                expo += ((b - a) / DAY) if H is None else (H / math.log(2)) * (w(b) - w(a))
        rows[pid] = (sold, expo)
    shop_sold = sum(w(r.ts) * r.q for r in it.itertuples())
    shop_expo = 0.0
    for r in seg[seg.pieces > 0].itertuples():
        shop_expo += r.days if H is None else (H / math.log(2)) * (w(r.t1) - w(r.t0))
    return rows, shop_sold, shop_expo


def z_abc(net90):
    """design method 4: rank by 90-day net sales (ties in table order), A <= 80%, B <= 95%, C rest / no sales."""
    s = net90.sort_values(ascending=False, kind="stable")
    tot = s.sum(); cum = s.cumsum() / tot
    cls = {}
    for pid, c in cum.items():
        cls[pid] = "C" if net90[pid] <= 0 else ("A" if c <= 0.8 + 1e-9 else ("B" if c <= 0.95 + 1e-9 else "C"))
    return cls


def run_design(line_key="brand+name", H=14.0, k=7.0):
    rows, _, _ = weighted(H)
    net90 = it.groupby("pid").ltot.sum().reindex(prod.pid, fill_value=0)
    cls = z_abc(net90)
    zmap = {"A": 1.96, "B": 1.64, "C": 1.28}
    # pools: brand+name is unique per product live, so each pool is the product itself; 'category' = line here
    shop_rate = sum(v[0] for v in rows.values()) / sum(v[1] for v in rows.values())
    pool = {}
    for p in prod.itertuples():
        members = [p.pid] if line_key == "brand+name" else list(prod.loc[prod.line == p.line, "pid"])
        s_ = sum(rows[m][0] for m in members); e_ = sum(rows[m][1] for m in members)
        pool[p.pid] = s_ / e_ if e_ > 0 else shop_rate
    out = []
    for p in prod.itertuples():
        ws, we = rows[p.pid]
        pace = (ws + k * pool[p.pid]) / (we + k)
        z = zmap[cls[p.pid]]
        var_d = pace * LUMP
        ss_l = z * math.sqrt(L_GUESS * var_d + pace ** 2 * SDL_GUESS ** 2)
        ss_lr = z * math.sqrt((L_GUESS + R_HIST) * var_d + pace ** 2 * SDL_GUESS ** 2)
        rop = math.ceil(pace * L_GUESS + ss_l); S = math.ceil(pace * (L_GUESS + R_HIST) + ss_lr)
        pos = 0 + on_order[p.pid]
        new = (p.pid not in stocked) and on_order[p.pid] == 0
        status = "new" if new else ("order" if pos <= rop else ("soon" if pos - pace * R_HIST <= rop else "ok"))
        sug = max(0, S - pos) if status in ("order", "soon") else 0
        out.append(dict(pid=p.pid, line=p.line, flavour=p.flavour, cls=cls[p.pid], pace=pace, rop=rop, S=S, pos=pos,
                        status=status, suggest=sug, cost=p.cost))
    d = pd.DataFrame(out)
    return d


for lk in ("brand+name", "category"):
    d = run_design(lk)
    pcs = int(d.suggest.sum()); goods = float((d.suggest * d.cost).sum() / P)
    put(f"design_{lk}_pcs", pcs); put(f"design_{lk}_goods", goods)
    print(f"design as written, pool = {lk:10s}: sum pace {d.pace.sum():5.2f}/day, suggest {pcs} pcs, goods PHP {goods:,.0f},"
          f" statuses {d.status.value_counts().to_dict()}, ROP {d.rop.min()}-{d.rop.max()}, S {d.S.min()}-{d.S.max()},"
          f" classes {d.cls.value_counts().to_dict()}")
    if lk == "brand+name":
        print(d.groupby("line")[["pace", "rop", "S", "suggest"]].agg(["min", "max", "sum"]).round(2).to_string())


def largest_remainder(total, shares):
    shares = np.asarray(shares, float)
    if total <= 0 or shares.sum() <= 0:
        return np.zeros(len(shares), int)
    raw = total * shares / shares.sum()
    base = np.floor(raw).astype(int)
    left = int(total - base.sum())
    order = np.lexsort((-shares, -(raw - base)))           # biggest fraction first, ties to the faster product
    base[order[:left]] += 1
    return base


def run_topdown(H=28.0, k=7.0, z=1.645, lam=None, L=L_GUESS, sdl=SDL_GUESS, R=R_HIST, cap_devices=True):
    """maths review: shop pace lambda split by relative speed, one pooled safety stock, largest-remainder rounding."""
    rows, ss, se = weighted(H)
    lam = ss / se if lam is None else lam
    shop_r = sum(v[0] for v in rows.values()) / sum(v[1] for v in rows.values())
    r = {}
    for p in prod.itertuples():
        members = list(prod.loc[prod.line == p.line, "pid"])
        s_ = sum(rows[m][0] for m in members); e_ = sum(rows[m][1] for m in members)
        r_line = s_ / e_ if e_ > 0 else shop_r
        ws, we = rows[p.pid]
        r[p.pid] = (ws + k * r_line) / (we + k)
    share = np.array([r[p] for p in prod.pid]); share = share / share.sum()
    rop_shop = lam * L + z * math.sqrt(L * lam * LUMP + lam ** 2 * sdl ** 2)
    s_shop = lam * (L + R) + z * math.sqrt((L + R) * lam * LUMP + lam ** 2 * sdl ** 2)
    rop_i = largest_remainder(round(rop_shop), share)
    s_i = largest_remainder(round(s_shop), share)
    d = prod[["pid", "line", "flavour", "cost"]].copy()
    d["pace"] = lam * share; d["rop"] = rop_i; d["S"] = s_i
    d["pos"] = [on_order[p] for p in d.pid]
    d["new"] = [p not in stocked for p in d.pid]
    d["status"] = np.where(d.new, "new", np.where(d.pos <= d.rop, "order",
                           np.where(d.pos - d.pace * R <= d.rop, "soon", "ok")))
    d["suggest"] = np.where(d.status.isin(["order", "soon"]), np.maximum(0, d.S - d.pos), 0)
    pos_shop = float(np.minimum(d.pos, np.maximum(d.S, 3)).sum()) if cap_devices else float(d.pos.sum())
    return d, lam, rop_shop, s_shop, pos_shop


d_td, lam28, rop_shop, s_shop, pos_shop = run_topdown()
pcs = int(d_td.suggest.sum()); goods = float((d_td.suggest * d_td.cost).sum() / P)
put("td_lam28", lam28); put("td_rop_shop", rop_shop); put("td_S_shop", s_shop); put("td_pcs", pcs); put("td_goods", goods)
print(f"top-down (H 28, z 1.645): lambda {lam28:.2f}/day, ROP_shop {rop_shop:.1f}, S_shop {s_shop:.1f}, position_shop"
      f" {pos_shop:.0f} -> suggest {pcs} pcs, goods PHP {goods:,.0f}; per-flavour S {d_td.S.min()}-{d_td.S.max()},"
      f" ROP {d_td.rop.min()}-{d_td.rop.max()}; statuses {d_td.status.value_counts().to_dict()}")
for zz in (1.28, 1.645, 1.96):
    dz = run_topdown(z=zz)[0]
    print(f"   z {zz}: suggest {int(dz.suggest.sum())} pcs, PHP {float((dz.suggest * dz.cost).sum() / P):,.0f}")
# safety stock: how much of it is delivery-time doubt
for lam_ in (lam_any, OUT["lam_most_70"]):
    dem = 7 * lam_ * LUMP; lead = lam_ ** 2 * SDL_GUESS ** 2
    ss = 1.645 * math.sqrt(dem + lead); ss_known = 1.645 * math.sqrt(dem + lam_ ** 2 * 0.75 ** 2)
    print(f"lambda {lam_:.2f}: spare stock {ss:.1f} pcs (delivery doubt = {lead / (dem + lead):.0%} of its variance);"
          f" with a 0.75-day spread instead of 1.75: {ss_known:.1f} pcs")
    put(f"ss_{lam_:.2f}", ss); put(f"ss_lead_share_{lam_:.2f}", lead / (dem + lead)); put(f"ss_known_{lam_:.2f}", ss_known)

# ==================================================================================================================
h("C. Demand model calibrated on Batches 1 and 2: buyers switch flavour or walk away?")
# ==================================================================================================================
obs = {}
for b, line in ((1, "XBLACK MAX"), (2, "Black TEO")):
    d = fl[fl.line == line]
    t0, t1 = d.first.min(), d.out.max()
    sg = seg[(seg.t0 >= t0) & (seg.t1 <= t1)]
    st = sale_ts[(sale_ts.ts >= t0) & (sale_ts.ts <= t1)]
    bp = []
    for lo, hi in bands:
        dd = sg[(sg.nflav >= lo) & (sg.nflav <= hi)].days.sum()
        bp.append(st[(st.nflav >= lo) & (st.nflav <= hi)].q.sum() / dd if dd > 0 else np.nan)
    so = d.days_to_sell_out.values
    obs[b] = dict(T=(t1 - t0) / DAY, band=bp, med=np.median(so), cv=so.std() / so.mean())
    print(f"Batch {b}: 30 pcs in {obs[b]['T']:.2f} days; pace with 7-10 / 4-6 / 1-3 flavours: "
          f"{bp[0]:.2f} / {bp[1]:.2f} / {bp[2]:.2f}; flavour sell-out median {obs[b]['med']:.2f} d, CV {obs[b]['cv']:.2f}")


def batch_sim(D, s, sig, rng, n=10, per=3, tmax=80.0):
    w = rng.lognormal(0, sig, n); w /= w.sum()
    stock = np.full(n, per); t = 0.0; out = np.full(n, np.nan)
    bt = np.zeros(3); bs = np.zeros(3); last = 0.0
    while stock.sum() > 0 and t < tmax:
        dt = rng.exponential(1 / D)
        k = int((stock > 0).sum()); b = 0 if k >= 7 else (1 if k >= 4 else 2)
        bt[b] += dt; t += dt
        f = rng.choice(n, p=w)
        g = -1
        if stock[f] > 0:
            g = f
        elif rng.random() < s:
            ww = w * (stock > 0); g = rng.choice(n, p=ww / ww.sum())
        if g >= 0:
            stock[g] -= 1; bs[b] += 1; last = t
            if stock[g] == 0:
                out[g] = t
    return last, bs / np.where(bt > 0, bt, np.nan), np.nanmedian(out), np.nanstd(out) / np.nanmean(out)


def fit_stats(D, s, sig, nsim, seed):
    rng = np.random.default_rng(seed)
    r = [batch_sim(D, s, sig, rng) for _ in range(nsim)]
    T = np.mean([x[0] for x in r]); band = np.nanmean(np.array([x[1] for x in r]), axis=0)
    return T, band, np.mean([x[2] for x in r]), np.mean([x[3] for x in r])


def loss(st, o):
    T, band, med, cv = st
    terms = [math.log(T / o["T"]), math.log(med / o["med"]), (cv - o["cv"]) / 0.15]
    terms += [math.log(band[i] / o["band"][i]) for i in range(3)]
    return float(np.sum(np.square(terms)))


GRID_D = [2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 4.0, 4.5, 5.0, 6.0]
GRID_S = [0.0, 0.15, 0.3, 0.45, 0.7, 1.0]
GRID_SIG = [0.4, 0.7, 1.0]
best = {}
cal_rows = []
for s in GRID_S:
    for sig in GRID_SIG:
        tot = 0.0; picks = {}
        for b in (1, 2):
            cand = [(loss(fit_stats(D, s, sig, 150, 7 + int(D * 10) + b), obs[b]), D) for D in GRID_D]
            l_, D_ = min(cand); tot += l_; picks[b] = D_
        cal_rows.append((s, sig, picks[1], picks[2], tot))
cal = pd.DataFrame(cal_rows, columns=["switch", "sigma", "D_batch1", "D_batch2", "loss"]).sort_values("loss")
print(cal.head(8).round(3).to_string(index=False))
prof = cal.groupby("switch").loss.min()
print("best loss by switch share:", prof.round(2).to_dict())
S_BEST, SIG_BEST, D1, D2 = cal.iloc[0][["switch", "sigma", "D_batch1", "D_batch2"]]
put("cal_switch", S_BEST); put("cal_sigma", SIG_BEST); put("cal_D1", D1); put("cal_D2", D2)
put("cal_loss_profile", prof.round(2).to_dict())
st2 = fit_stats(D2, S_BEST, SIG_BEST, 600, 99)
print(f"best fit: switch {S_BEST}, flavour spread sigma {SIG_BEST}, buyers a day B1 {D1}, B2 {D2};"
      f" B2 check: sells 30 in {st2[0]:.1f} d (obs {obs[2]['T']:.1f}), band paces {np.round(st2[1], 2)} (obs {np.round(obs[2]['band'], 2)})")
print("External reference: Gruen, Corsten & Bharadwaj (2002), 71,000 shoppers, 29 countries: when an item is out, about"
      " 45% buy a substitute in the same store, 31% buy elsewhere, 15% delay, 9% do not buy (grocery).")

# ==================================================================================================================
h("D. Order economics: fee per order, holding cost, EOQ, cost of an empty day, service level")
# ==================================================================================================================
q_ = np.array([30, 30, 40.0]); f_ = np.array([239, 244, 264.0])
b_fee = float(((q_ - q_.mean()) * (f_ - f_.mean())).sum() / ((q_ - q_.mean()) ** 2).sum())
a_fee = float(f_.mean() - b_fee * q_.mean())
put("fee_fixed", a_fee); put("fee_per_piece", b_fee)
print(f"restocking fee per order ~= PHP {a_fee:.0f} + PHP {b_fee:.2f} x pieces (3 orders; shipping only)")
COST, PRICE = 165.0, 340.0
LANDED_MARGIN = 159.45
for lam_ in (lam_any, OUT["lam_most_70"]):
    for i_year in (0.25, 1.0):
        hday = i_year * COST / 365
        q_star = math.sqrt(2 * lam_ * a_fee / hday)
        def yearly(Q):
            return 365 * lam_ / Q * (a_fee + b_fee * Q) + Q / 2 * hday * 365
        print(f"lambda {lam_:.2f}/day, holding {i_year:.0%}/yr: EOQ {q_star:5.0f} pcs = {q_star / lam_:4.1f} days of cover;"
              f" fees+holding a year at Q=30: PHP {yearly(30):,.0f}, Q=40: {yearly(40):,.0f}, Q=EOQ: {yearly(q_star):,.0f}"
              f" -> saving Q40->EOQ PHP {(yearly(40) - yearly(q_star)) / 12:,.0f}/month")
        put(f"eoq_{lam_:.2f}_{i_year}", q_star); put(f"eoq_save_month_{lam_:.2f}_{i_year}", (yearly(40) - yearly(q_star)) / 12)
for lam_ in (lam_any, OUT["lam_most_70"]):
    print(f"gross profit lost per empty day at {lam_:.2f}/day: PHP {lam_ * LANDED_MARGIN:,.0f}")
# critical ratio (newsvendor): understock cost vs overstock cost for one more piece held one more cycle
for sw in (0.0, 0.45):
    cu = LANDED_MARGIN * (1 - sw)
    for i_cycle, label in ((0.25 * R_HIST / 365, "25%/yr"), (0.10, "10% a cycle (cash is short)")):
        co = i_cycle * (COST + b_fee)
        print(f"switch {sw:.0%}: under {cu:.0f}, over {co:.1f} ({label}) -> critical ratio {cu / (cu + co):.1%}")
# order every 7 days instead of every 14.5: extra fees vs less cash tied
extra_orders = 30 / 7 - 30 / R_HIST
for lam_ in (lam_any, OUT["lam_most_70"]):
    print(f"lambda {lam_:.2f}: weekly orders add {extra_orders:.2f} orders/month x PHP {a_fee:.0f} = PHP {extra_orders * a_fee:,.0f}/month;"
          f" average cycle stock falls by {lam_ * (R_HIST - 7) / 2:.1f} pcs = PHP {lam_ * (R_HIST - 7) / 2 * COST:,.0f} of cash")
put("weekly_extra_fees_month", extra_orders * a_fee)
put("pipeline_cash_7d_any", lam_any * 7 * COST); put("pipeline_cash_7d_full", OUT["lam_most_70"] * 7 * COST)
print(f"stock on the way, paid at order: lambda x L x cost = PHP {lam_any * 7 * COST:,.0f} (2.22/day) to"
      f" PHP {OUT['lam_most_70'] * 7 * COST:,.0f} (full-shelf pace) tied for 7 days per cycle; paying on pick-up frees it")

# ==================================================================================================================
h("E. The next order (Batch 4): when the plan wants it vs when the shop's own cash allows it")
# ==================================================================================================================
collect_lags = np.array([0, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 8, 8, 8] + [9] * 9 + [10, 11, 11, 12, 13, 13, 13, 21])
assert len(collect_lags) == 31
CASH_SHARE = 1 - 14540 / 19800          # 26.6% of sales value paid at the till
open_bal = [(34000, 0), (34000, 1), (68000, 4), (34000, 7), (34000, 16), (4000, 16)]   # (cents, age days) -- 6 open sales
assert sum(c for c, _ in open_bal) == FIN_END["receivables"]


def next_order_case(L, lam_, q_pods=37, cost_q=None):
    """day 0 = 26 Nov. Batch 3's 30 pods arrive on 25 Nov + L. Cash = 340 + collections of open balances
    (expected: remaining lag = mean of the empirical lags above the age, else 1 day) + Batch 3 pod sales."""
    cost_q = cost_q if cost_q else q_pods * COST + a_fee + b_fee * q_pods
    arr = L - 1                                     # 25 Nov + L, counted from 26 Nov
    days = np.arange(0, 60)
    cash = np.full(len(days), 340.0)
    for c, age in open_bal:
        rest = collect_lags[collect_lags > age]
        lag = max(1, int(round(rest.mean() - age))) if len(rest) else 7
        cash[days >= lag] += c / P
    sold_by = np.clip((days - arr) * lam_, 0, 30)
    daily = np.diff(np.concatenate([[0], sold_by]))
    p_lag = np.bincount(collect_lags, minlength=60)[:60] / 31
    for d0 in range(len(days)):
        if daily[d0] <= 0:
            continue
        v = daily[d0] * PRICE
        cash[d0:] += v * CASH_SHARE
        for lag, p in enumerate(p_lag):
            if d0 + lag < len(days):
                cash[d0 + lag:] += v * (1 - CASH_SHARE) * p
    sellout = arr + 30 / lam_
    rop = lam_ * L + 1.645 * math.sqrt(L * lam_ * LUMP + lam_ ** 2 * SDL_GUESS ** 2)
    want = arr + max(0.0, (30 - rop) / lam_)                       # order-by day from the shop position after arrival
    can = int(np.argmax(cash >= cost_q)) if (cash >= cost_q).any() else None
    order_day = max(want, can) if can is not None else None
    gap = max(0.0, order_day + L - sellout) if order_day is not None else None
    cash_want = float(cash[min(len(days) - 1, int(math.floor(want)))])
    return dict(L=L, lam=lam_, arrive=arr, rop=rop, want=want, can=can, sellout=sellout, gap=gap, cost=cost_q,
                cash_at_want=cash_want, short=max(0.0, cost_q - cash_want))


base_day = pd.Timestamp("2026-11-26")
rows_e = []
for L in (5, 7, 10):
    for lam_ in (lam_any, OUT["lam_most_70"]):
        r = next_order_case(L, lam_)
        f = lambda x: (base_day + pd.Timedelta(days=float(x))).strftime("%d %b")
        rows_e.append(dict(delivery_days=L, pace=round(lam_, 2), batch3_pods_arrive=f(r["arrive"]),
                           sold_out=f(r["sellout"]), plan_order_by=f(r["want"]) if r["want"] > r["arrive"] else f(r["arrive"]) + " (on arrival)",
                           cash_allows=f(r["can"]) if r["can"] is not None else "never",
                           empty_days=round(r["gap"], 1), gp_lost=round(r["gap"] * lam_ * LANDED_MARGIN),
                           cash_on_order_by=round(r["cash_at_want"]), short_by=round(r["short"])))
e_tab = pd.DataFrame(rows_e)
print(f"next order: 37 pods, PHP {37 * COST + a_fee + b_fee * 37:,.0f} with fees")
print(e_tab.to_string(index=False))
put("batch4_table", e_tab.to_dict("records"))
# what extra cash removes the gap: cost of the order minus cash on the plan's order-by day
for L in (7,):
    for lam_ in (lam_any, OUT["lam_most_70"]):
        r = next_order_case(L, lam_)
        print(f"L {L}, pace {lam_:.2f}: needs PHP {r['cost']:,.0f} by day {r['want']:.1f}; has PHP {r['cash_at_want']:,.0f}"
              f" -> short PHP {r['short']:,.0f}")
        put(f"batch4_short_L{L}_{lam_:.2f}", r["short"]); put(f"batch4_gap_L{L}_{lam_:.2f}", r["gap"])

# ==================================================================================================================
h("F. Policy simulation (180 days, from today's state)")
# ==================================================================================================================
LEAD_RANGE = (5, 7)                                   # owners' stated 5-7 days
P_LAG = np.bincount(collect_lags, minlength=40) / 31
INIT_RECV = [(c / P, max(1, int(round(collect_lags[collect_lags > a].mean() - a)) if (collect_lags > a).any() else 7))
             for c, a in open_bal]
OPEX_DAY = 740 / 31                                   # running costs so far, about PHP 716 a month


def sim_policy(policy, D, s, sig, runs=200, days=180, payout="all", extra_cash=0.0, lead=LEAD_RANGE,
               depth="flat", estimator="any", seed=1, q_fixed=40, q_min=10, rhythm=14):
    """Daily simulation of one range of 10 pod flavours (re-ordered as needed), from today's state.
    Buyers ~ Poisson(D)/day each want one flavour (weights lognormal(sig)); if it is out they switch to an in-stock
    flavour with prob s, else the sale is lost. Orders are paid at order (fee a + b*q) and take 5-7 days. Sales are
    26.6% cash; credit is collected with the shop's own lag distribution. Running costs PHP 24 a day.
    payout: 'none' = no payouts and cash may go below zero (no cash limit); 'all' = every 14 days the owners take
    all profit kept that the cash allows (as on 25 Nov); 'next' = same, but cash for the next full order stays.
    The engine re-estimates pace from its own censored history and delivery time from its own orders."""
    rng = np.random.default_rng(seed)
    res = []
    for run in range(runs):
        w = rng.lognormal(0, sig, 10); w = w / w.sum()
        stock = np.zeros(10, int); fsold = np.zeros(10); fin = np.zeros(10)
        cash = 340.0 + extra_cash
        inflow = np.zeros(days + 60)
        for c, lag in INIT_RECV:
            inflow[lag] += c
        L0 = int(rng.integers(lead[0], lead[1] + 1))
        pipe = [(L0 - 1, 30, -1)]                       # Batch 3's 30 pods, ordered 25 Nov (day -1)
        hist_sold = np.zeros(days); hist_open = np.zeros(days); hist_full = np.zeros(days)
        lead_obs = []; last_order = -99
        gp = fees = lost = sold_tot = tied = dist = 0.0; empty_days = 0; n_orders = 0; cum_profit = 0.0
        late_orders = 0
        for t in range(days):
            cash += inflow[t] - OPEX_DAY
            cum_profit -= OPEX_DAY
            for item in [x for x in pipe if x[0] == t]:
                pipe.remove(item); lead_obs.append(item[0] - item[2]); q = item[1]
                r_ = (fsold + 7 * 0.25) / (fin + 7) if depth == "speed" else np.ones(10)
                target = largest_remainder(q + int(stock.clip(0).sum()), r_)
                add = np.maximum(0, target - stock)
                add = largest_remainder(q, add + 1e-9) if add.sum() > 0 else largest_remainder(q, r_)
                stock += add
            on_hand = int(stock.clip(0).sum())
            hist_open[t] = 1.0 if on_hand > 0 else 0.0
            hist_full[t] = 1.0 if (stock > 0).sum() >= 7 else 0.0
            empty_days += on_hand <= 0
            fin += stock > 0
            n_b = rng.poisson(D); sold_today = 0
            for f in rng.choice(10, size=n_b, p=w):
                g = -1
                if stock[f] > 0:
                    g = f
                elif rng.random() < s and stock.sum() > 0:
                    wa = w * (stock > 0); g = rng.choice(10, p=wa / wa.sum())
                if g >= 0:
                    stock[g] -= 1; fsold[g] += 1; sold_today += 1
                else:
                    lost += 1
            hist_sold[t] = sold_today; sold_tot += sold_today
            rev = sold_today * PRICE
            gp += sold_today * (PRICE - COST); cum_profit += sold_today * (PRICE - COST)
            cash += rev * CASH_SHARE
            if sold_today:
                inflow[t:t + len(P_LAG)] += rev * (1 - CASH_SHARE) * P_LAG[: len(inflow) - t]
            on_hand = int(stock.clip(0).sum()); on_way = sum(x[1] for x in pipe)
            tied += (on_hand + on_way) * COST
            # the engine: pace, delivery time, spare stock
            lo = max(0, t - 59)
            if estimator == "full" and hist_full[lo:t + 1].sum() >= 3:
                lam_hat = hist_sold[lo:t + 1][hist_full[lo:t + 1] > 0].sum() / hist_full[lo:t + 1].sum()
            elif hist_open[lo:t + 1].sum() >= 7:
                lam_hat = hist_sold[lo:t + 1].sum() / hist_open[lo:t + 1].sum()
            else:
                lam_hat = lam_any                           # starting point = the shop's pace to date
            n_l = len(lead_obs)
            L_hat = (sum(lead_obs) + 7.0) / (n_l + 1)       # one pseudo-order at the 7-day starting guess
            sd_l = math.sqrt((sum((x - L_hat) ** 2 for x in lead_obs) + 2 * (L_hat / 4) ** 2) / (n_l + 1))
            def spare(days_):
                return 1.645 * math.sqrt(days_ * lam_hat * LUMP + lam_hat ** 2 * sd_l ** 2)
            rop = lam_hat * L_hat + spare(L_hat)
            S_full = lam_hat * (L_hat + rhythm) + spare(L_hat + rhythm)
            pos = on_hand + on_way
            q = 0
            if policy == "sellout":            # as now: order the usual 40 when the shelf is down to its last 2
                if on_hand <= 2 and on_way == 0:
                    q = q_fixed
            elif policy == "rop40":            # the usual 40, but when the position reaches the reorder point
                if pos <= rop:
                    q = q_fixed
            elif policy == "rop_S":            # at the reorder point, order up to delivery + 14 days + spare
                if pos <= rop:
                    q = int(math.ceil(S_full - pos))
            elif policy == "weekly":           # every 7 days, order up to delivery + 7 days + spare
                if t - last_order >= 7:
                    S7 = lam_hat * (L_hat + 7) + spare(L_hat + 7)
                    if S7 - pos >= q_min:
                        q = int(math.ceil(S7 - pos))
            if q > 0:
                if payout != "none":
                    q = min(q, int((cash - a_fee) // (COST + b_fee)))
                if q >= q_min:
                    fee = a_fee + b_fee * q
                    cash -= q * COST + fee; fees += fee; cum_profit -= fee; n_orders += 1; last_order = t
                    late_orders += on_hand == 0
                    pipe.append((t + int(rng.integers(lead[0], lead[1] + 1)), q, t))
            # payouts every 14 days
            if payout != "none" and t % 14 == 13:
                keep = 0.0 if payout == "all" else S_full * (COST + b_fee) + a_fee
                take = max(0.0, min(cum_profit - dist, cash - keep))
                dist += take; cash -= take
        res.append(dict(gp_month=(gp - fees) / days * 30, payout_month=dist / days * 30, sold_day=sold_tot / days,
                        lost_day=lost / days, fill=sold_tot / max(1, sold_tot + lost),
                        empty_days_month=empty_days / days * 30, orders_month=n_orders / days * 30,
                        fees_month=fees / days * 30, cash_in_stock=tied / days, end_cash=cash,
                        orders_at_empty=late_orders / max(1, n_orders)))
    return pd.DataFrame(res).mean()


D_BASE = float(D2)
print(f"buyers a day D = {D_BASE} (Batch 2 fit), switch {S_BEST}, sigma {SIG_BEST}; delivery {LEAD_RANGE[0]}-{LEAD_RANGE[1]} days")
sim_rows = []
CASES = (("no cash limit, no payouts", "none", 0.0), ("pay out all profit the cash allows (as now)", "all", 0.0),
         ("keep the next order's cost, pay out the rest", "next", 0.0), ("as now + PHP 7,000 owner capital", "all", 7000.0))
for lab, payout, extra in CASES:
    for pol in ("sellout", "rop40", "rop_S", "weekly"):
        r = sim_policy(pol, D_BASE, S_BEST, SIG_BEST, payout=payout, extra_cash=extra, seed=11)
        sim_rows.append(dict(cash=lab, policy=pol, **r.round(2).to_dict()))
sim_tab = pd.DataFrame(sim_rows)
pd.set_option("display.width", 250)
print(sim_tab[["cash", "policy", "gp_month", "payout_month", "sold_day", "lost_day", "fill", "empty_days_month",
               "orders_month", "fees_month", "cash_in_stock", "orders_at_empty"]].to_string(index=False))
put("sim_tab", sim_tab.to_dict("records"))
sens = []
def srun(case, pol, **kw):
    base = dict(D=D_BASE, s=S_BEST, sig=SIG_BEST, payout="next", seed=21, runs=150)
    base.update(kw)
    r = sim_policy(pol, base.pop("D"), base.pop("s"), base.pop("sig"), **base)
    sens.append(dict(case=case, policy=pol, gp_month=round(r.gp_month), payout_month=round(r.payout_month),
                     fill=round(r.fill, 3), empty_days_month=round(r.empty_days_month, 2), cash_in_stock=round(r.cash_in_stock)))
for s_ in (0.0, 0.45):
    for pol in ("sellout", "rop_S", "weekly"):
        srun(f"switch {s_:.0%}", pol, s=s_)
for pol in ("sellout", "rop_S", "weekly"):
    srun("delivery 8-12 days", pol, lead=(8, 12))
for pol in ("sellout", "rop_S", "weekly"):
    srun(f"busier: D {D1} (Batch 1 fit)", pol, D=float(D1))
for est in ("any", "full"):
    srun(f"pace measured on: {'days with any stock' if est == 'any' else 'days with 7+ flavours'}", "rop_S", estimator=est)
for dep in ("flat", "speed"):
    srun(f"flavour depth: {dep}", "rop_S", depth=dep)
sens_tab = pd.DataFrame(sens)
print(sens_tab.to_string(index=False))
put("sens_tab", sens_tab.to_dict("records"))

# ==================================================================================================================
h("G. Flavour depth for a re-ordered line: flat vs by speed")
# ==================================================================================================================
for line in ("XBLACK MAX", "Black TEO"):
    d = fl[fl.line == line].copy()
    r_line = d.sold.sum() / d.instock.sum()
    d["speed"] = (d.sold - 1 + 7 * r_line) / (d.instock + 7)     # unbiased, shrunk 7 days toward the line
    for Q in (30, 40):
        flat = largest_remainder(Q, np.ones(10)); spd = largest_remainder(Q - 20, d.speed.values) + 2   # at least 2 each
        print(f"{line} {Q} pcs: by speed (min 2 each) {dict(zip(d.flavour, spd))}")
        # expected first sell-out and cycle sales, no switching, buyers at the line's own in-stock flavour rates
        rng = np.random.default_rng(5)
        rates = d.speed.values
        for name, alloc in (("flat", flat), ("speed", spd)):
            outs = []; sold14 = []
            for _ in range(2000):
                tt = [rng.gamma(a, 1 / r) if a > 0 else 0 for a, r in zip(alloc, rates)]
                outs.append(min(tt)); sold14.append(sum(min(a, rng.poisson(r * 14)) for a, r in zip(alloc, rates)))
            print(f"   {name:5s}: first flavour out after {np.median(outs):4.1f} days (median), pieces sold in 14 days"
                  f" {np.mean(sold14):4.1f} of {Q} (no switching)")
            put(f"depth_{line}_{Q}_{name}_sold14", float(np.mean(sold14)))

# ==================================================================================================================
h("H. Alerts (method 7), not-selling (method 6) and the batch report (method 10) on live data")
# ==================================================================================================================
d_des = run_design("brand+name")
print(f"Low badge today: reorder_at 5 -> {len(prod)} of {len(prod)} products; design ROP alert -> "
      f"{int((d_des.pos <= d_des.rop).sum())} of {len(prod)} (every flavour ROP >= {d_des.rop.min()}, so Low the moment 3 arrive)")
alert = np.where(d_td.new, 0, np.maximum(1, d_td.rop))
print(f"top-down auto alert max(1, ROP_i): alert at {sorted(set(alert[alert > 0]))} pcs; with 3 on the shelf a flavour"
      f" shows Low only at its last {int(np.max(alert))} piece(s)")
for lam_, nf in ((lam_any, 10), (lam_any, 20), (lam_any, 30)):
    pace_i = lam_ / nf
    t_ns = min(60, max(R_HIST, 3 / pace_i))
    print(f"not selling with {nf} flavours on the shelf at {lam_:.2f}/day: threshold {t_ns:.0f} days"
          f" (Poisson: chance of no sale in that time {math.exp(-pace_i * t_ns):.1%}; at R alone {math.exp(-pace_i * R_HIST):.0%})")
print(f"batch report as designed: Batch 2's 10 flavours are out with a pace -> 'Order now' although 30 pods are on the way;"
      f" shop-level: position {pos_shop:.0f} vs ROP_shop {rop_shop:.1f} -> not yet")

h("I. What the recommended engine shows today (top-down, pooled spare stock, pods and devices apart)")
due = pd.Timestamp("2026-11-25") + pd.Timedelta(days=L_GUESS)          # Batch 3 due: order day + 7-day starting guess
pods_pos = 30                                                          # Batch 3 pods; the 10 devices are planned apart
for lab, pos_ in (("pods only", pods_pos), ("all products, devices capped at max(S_i, 3)", pos_shop)):
    od = due + pd.Timedelta(days=(pos_ - rop_shop) / lam28)
    print(f"{lab}: position {pos_:.0f} vs reorder point {rop_shop:.1f} -> order by {od.strftime('%a %d %b')}")
    put(f"order_by_{lab[:4]}", od.strftime("%d %b"))
nxt = round(s_shop - rop_shop)
nxt_cost = nxt * COST + a_fee + b_fee * nxt
put("next_order_pcs", nxt); put("next_order_cost", nxt_cost)
print(f"next order at the order-by date: S_shop - ROP_shop = {s_shop:.1f} - {rop_shop:.1f} = {nxt} pcs,"
      f" about PHP {nxt_cost:,.0f} with fees; next usual order day {(order_days[-1] + pd.Timedelta(days=R_HIST)).strftime('%d %b')}")
for L in (5, 7):
    r = next_order_case(L, lam_any)
    afford = int((r["cash_at_want"] - a_fee) // (COST + b_fee))
    print(f"delivery {L} days: cash on the order-by day about PHP {r['cash_at_want']:,.0f} -> fits your money: {afford} pcs")
    put(f"fits_money_L{L}", afford)
top = d_td[~d_td.new].sort_values("pace", ascending=False)
print("per-flavour split of the shop plan (largest remainder), if the same flavours were re-ordered:")
print(top[["line", "flavour", "pace", "rop", "S", "suggest"]].round(3).to_string(index=False))

h("Headline numbers")
for k, v in OUT.items():
    if not isinstance(v, (list, dict)):
        print(f"{k:40s} {v:,.3f}" if isinstance(v, float) else f"{k:40s} {v}")
print(f"\nran in {time.time() - T0:.0f} s")
