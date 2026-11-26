#!/usr/bin/env python3
"""Cloud Factory fact base (baseline) -- every number in baseline.md comes from this script.

Data: read-only aggregate pulls from the live Supabase database on 2026-11-26 18:59 Manila time,
embedded below so the script re-runs offline:  python3 analysis/baseline.py
Amounts are in centavos in the data and printed in pesos. Times are Manila local time.

Privacy: no buyer names are stored here. `bk` is a pseudonymous buyer number (1, 2, 3 ... in order of
first purchase) used only to count distinct and repeat buyers; it has no link to a name in this repo.

Writes analysis/baseline_metrics.json (the key metrics with formulas) and prints the tables.
"""
import json
import os
from collections import defaultdict

import numpy as np
import pandas as pd

AS_OF = pd.Timestamp("2026-11-26 18:59")      # data pulled (Manila)
TODAY = pd.Timestamp("2026-11-26")
FIRST_DAY = pd.Timestamp("2026-10-27")
P = 100.0                                      # centavos per peso

# ---------------------------------------------------------------------------------------------
# 1. DATA (pulled 2026-11-26 with SELECT statements and the owner's finance_report, rolled back)
# ---------------------------------------------------------------------------------------------
SETTINGS = dict(restock_lead_days=7, restock_buffer_days=3, restock_cover_days=14, pace_window_days=28,
                split_owner_parts=2, split_manager_parts=1, tax_rate_bp=0, reorder_at_all_products=5)

# pid -> (line, flavour, price_cents, cost_cents). Line = brand / category the batch brought.
PRODUCTS = {
    # Batch 1: XBLACK MAX (category TRANSPARENT V2 PODS)
    "fb0565c1": ("XBLACK MAX", "Banana", 32000, 16000), "b36ffe23": ("XBLACK MAX", "Blackcurrant", 32000, 16000),
    "7838a1a6": ("XBLACK MAX", "Blueberry", 32000, 16000), "a776106d": ("XBLACK MAX", "Gummy Bear", 32000, 16000),
    "2fe96e7c": ("XBLACK MAX", "Lactic Acid Bacteria", 32000, 16000), "b11f39a1": ("XBLACK MAX", "Lychee Ice", 32000, 16000),
    "6b9844dc": ("XBLACK MAX", "Mango", 32000, 16000), "51b10437": ("XBLACK MAX", "Mixed Berries", 32000, 16000),
    "708718fb": ("XBLACK MAX", "Strawberry Ice", 32000, 16000), "11c368aa": ("XBLACK MAX", "Watermelon", 32000, 16000),
    # Batch 2: Black TEO
    "2e030261": ("Black TEO", "Bacteria Monster", 34000, 16500), "ad408d7d": ("Black TEO", "Blue Freeze", 34000, 16500),
    "65d35d2b": ("Black TEO", "Ice Monkey", 34000, 16500), "9264016b": ("Black TEO", "Red Pulp", 34000, 16500),
    "7bf8f43d": ("Black TEO", "Sparkle Squeeze", 34000, 16500), "ac41e6b0": ("Black TEO", "Trouble Purple", 34000, 16500),
    "c9eef57f": ("Black TEO", "Very Baguio", 34000, 16500), "d13c34c9": ("Black TEO", "Very Chill", 34000, 16500),
    "b705f1ae": ("Black TEO", "Very More", 34000, 16500), "cbb3b973": ("Black TEO", "Yellow Summer", 34000, 16500),
    # Batch 3 (on the way): BLXCK Signature 88000 + XBLACK Transparent Device V5
    "a98e9345": ("BLXCK Signature", "Banana", 34000, 16500), "f79721dd": ("BLXCK Signature", "Black", 34000, 16500),
    "04a2b3c7": ("BLXCK Signature", "Bubblegum", 34000, 16500), "038946f7": ("BLXCK Signature", "Grapes", 34000, 16500),
    "c77fdb3e": ("BLXCK Signature", "Mango", 34000, 16500), "1c8ad5e7": ("BLXCK Signature", "Melon", 34000, 16500),
    "04adcf96": ("BLXCK Signature", "Mix Berries", 34000, 16500), "bffb3bca": ("BLXCK Signature", "Strawberry", 34000, 16500),
    "e8fc0ba3": ("BLXCK Signature", "Watermelon", 34000, 16500), "c1650427": ("BLXCK Signature", "Yakult", 34000, 16500),
    "da86a284": ("Device", "XBLACK Transparent Device V5", 35000, 20000),
}
# every product: on_hand 0, reorder_at 5, active (live 2026-11-26)

# batch id -> (no, ordered_on, received_on, shipping, tax, mooe, other) cents
BATCHES = {
    "5e5c3cf4": (1, None, "2026-10-27", 23900, 0, 0, 0),
    "f5fec51d": (2, None, "2026-11-09", 24400, 0, 0, 0),
    "eea4e791": (3, "2026-11-25", None, 26400, 0, 0, 0),
}
ORDER_LINES_B3 = [(pid, 3, 16500) for pid in ["a98e9345", "f79721dd", "04a2b3c7", "038946f7", "c77fdb3e",
                                               "1c8ad5e7", "04adcf96", "bffb3bca", "e8fc0ba3", "c1650427"]] + [("da86a284", 10, 20000)]
BATCH_PAYMENTS = [("5e5c3cf4", 503900, "2026-10-27", "owner"), ("f5fec51d", 519400, "2026-11-09", "company"),
                  ("eea4e791", 721400, "2026-11-25", "company")]
EXPENSES = [("2026-11-09", "other", 64000, "5e5c3cf4"), ("2026-11-24", "utilities", 10000, "f5fec51d")]
RELEASES = [("2026-11-25", 423200, 282133, 141067)]          # (day, amount, owner, manager)
CAPITAL_CONTRIBUTIONS = []                                    # table empty
SET_ASIDES = [("2026-11-10", 0), ("2026-11-13", 719400), ("2026-11-20", 519400), ("2026-11-20", 725000),
              ("2026-11-25", 701400)]                         # inventory-reserve decisions, in order

# sales: (sid, business_date, created Manila, status, method, subtotal, discount, total, balance, buyer#)
SALES = [
    ("328cffe4", "2026-11-06", "2026-11-06 18:31", "completed", "cash", 32000, 0, 32000, 0, 13),
    ("8044f2f4", "2026-11-13", "2026-11-13 08:36", "completed", "cash", 34000, 0, 34000, 0, 13),
    ("7edab8f5", "2026-11-04", "2026-11-04 13:17", "completed", "unpaid", 32000, 0, 32000, 0, 20),
    ("a390a036", "2026-11-10", "2026-11-10 18:43", "completed", "cash", 34000, 0, 34000, 0, 15),
    ("46e7b59c", "2026-10-31", "2026-10-31 20:51", "completed", "unpaid", 32000, 0, 32000, 0, 18),
    ("9d06c003", "2026-11-26", "2026-11-26 11:16", "completed", "unpaid", 34000, 0, 34000, 34000, 5),
    ("c24e6095", "2026-11-14", "2026-11-14 03:16", "completed", "unpaid", 34000, 0, 34000, 0, 25),
    ("495a7579", "2026-10-28", "2026-10-28 17:21", "completed", "cash", 64000, 0, 64000, 0, 7),
    ("125a988f", "2026-11-17", "2026-11-17 12:43", "completed", "unpaid", 34000, 0, 34000, 0, 15),
    ("95ff14e5", "2026-10-30", "2026-10-30 15:54", "completed", "cash", 32000, 0, 32000, 0, 15),
    ("f226ee07", "2026-11-03", "2026-11-03 19:32", "completed", "unpaid", 96000, 0, 96000, 0, 1),
    ("656ab23e", "2026-11-20", "2026-11-20 18:58", "completed", "cash", 34000, 0, 34000, 0, 31),
    ("17affb46", "2026-10-27", "2026-10-27 11:36", "completed", "unpaid", 32000, 0, 32000, 0, 1),
    ("56b9398e", "2026-11-22", "2026-11-22 07:54", "voided", "unpaid", 34000, 34000, 0, 0, 16),
    ("138ad317", "2026-11-15", "2026-11-15 21:45", "completed", "unpaid", 68000, 0, 68000, 0, 26),
    ("a5b8be43", "2026-11-25", "2026-11-25 07:05", "completed", "unpaid", 34000, 0, 34000, 34000, 16),
    ("5ff2bfd6", "2026-11-19", "2026-11-19 08:45", "completed", "cash", 34000, 0, 34000, 0, 13),
    ("4385270b", "2026-11-16", "2026-11-16 21:08", "completed", "cash", 34000, 0, 34000, 0, 27),
    ("68bb2fdb", "2026-10-29", "2026-10-29 13:17", "completed", "unpaid", 32000, 0, 32000, 0, 12),
    ("ad3d5faa", "2026-10-27", "2026-10-27 11:37", "completed", "unpaid", 32000, 0, 32000, 0, 2),
    ("3038f3d0", "2026-10-29", "2026-10-29 19:14", "completed", "cash", 64000, 0, 64000, 0, 13),
    ("80bc6b23", "2026-10-30", "2026-10-30 18:32", "completed", "cash", 32000, 0, 32000, 0, 16),
    ("7f6de6b4", "2026-11-03", "2026-11-03 19:44", "completed", "cash", 32000, 0, 32000, 0, 19),
    ("c6ecaa34", "2026-10-28", "2026-10-28 17:42", "completed", "unpaid", 32000, 0, 32000, 0, 8),
    ("4463af62", "2026-11-17", "2026-11-17 12:44", "completed", "unpaid", 34000, 0, 34000, 0, 28),
    ("7a8f4e47", "2026-11-10", "2026-11-10 18:50", "completed", "unpaid", 34000, 0, 34000, 0, 21),
    ("b363000e", "2026-11-19", "2026-11-19 18:15", "completed", "unpaid", 34000, 0, 34000, 34000, 22),
    ("f115cae1", "2026-11-16", "2026-11-16 21:09", "completed", "unpaid", 34000, 0, 34000, 0, 16),
    ("9958ac75", "2026-11-22", "2026-11-22 22:03", "completed", "unpaid", 68000, 0, 68000, 68000, 23),
    ("1b621ecb", "2026-11-13", "2026-11-13 08:37", "completed", "unpaid", 34000, 0, 34000, 0, 23),
    ("5bff8fd9", "2026-10-28", "2026-10-28 18:08", "completed", "unpaid", 32000, 0, 32000, 0, 9),
    ("2958a555", "2026-10-29", "2026-10-29 19:37", "completed", "unpaid", 32000, 0, 32000, 0, 14),
    ("99b83a0d", "2026-11-10", "2026-11-10 18:51", "completed", "unpaid", 34000, 0, 34000, 4000, 10),
    ("c0754cca", "2026-10-30", "2026-10-30 18:33", "completed", "unpaid", 32000, 0, 32000, 0, 16),
    ("02461c27", "2026-10-27", "2026-10-27 11:38", "completed", "unpaid", 64000, 0, 64000, 0, 3),
    ("5139950e", "2026-11-13", "2026-11-13 16:43", "completed", "unpaid", 34000, 0, 34000, 0, 16),
    ("0cca798f", "2026-11-17", "2026-11-17 19:52", "completed", "cash", 34000, 0, 34000, 0, 29),
    ("31700d66", "2026-10-28", "2026-10-28 18:59", "completed", "unpaid", 32000, 0, 32000, 0, 10),
    ("3c12162b", "2026-11-13", "2026-11-13 16:44", "completed", "unpaid", 34000, 0, 34000, 0, 24),
    ("1bb02356", "2026-11-17", "2026-11-17 21:01", "completed", "unpaid", 34000, 0, 34000, 0, 30),
    ("2c9fcc63", "2026-11-10", "2026-11-10 18:51", "completed", "unpaid", 68000, 0, 68000, 0, 22),
    ("5778b9a9", "2026-10-30", "2026-10-30 18:51", "completed", "cash", 32000, 0, 32000, 0, 17),
    ("b7b09944", "2026-10-27", "2026-10-27 11:41", "completed", "unpaid", 32000, 0, 32000, 0, 4),
    ("e7fc1d91", "2026-10-30", "2026-10-30 18:57", "completed", "unpaid", 32000, 0, 32000, 0, 10),
    ("d43173f7", "2026-10-27", "2026-10-27 13:11", "completed", "unpaid", 64000, 0, 64000, 0, 5),
    ("c9425cd3", "2026-10-28", "2026-10-28 19:16", "completed", "unpaid", 32000, 0, 32000, 0, 11),
    ("6f8bf8db", "2026-11-10", "2026-11-10 18:52", "completed", "unpaid", 34000, 0, 34000, 34000, 1),
    ("dee1d2b2", "2026-11-17", "2026-11-17 21:01", "completed", "unpaid", 34000, 0, 34000, 0, 5),
    ("0a5e626d", "2026-11-13", "2026-11-13 16:44", "completed", "cash", 34000, 0, 34000, 0, 8),
    ("df3f6529", "2026-10-27", "2026-10-27 13:15", "completed", "unpaid", 32000, 0, 32000, 0, 6),
    ("14f48efc", "2026-11-10", "2026-11-10 18:53", "completed", "unpaid", 34000, 0, 34000, 0, 2),
    ("ed57cb7f", "2026-11-10", "2026-11-10 18:54", "completed", "unpaid", 34000, 0, 34000, 0, 12),
]
# sale lines: (sid, pid, qty, unit price, unit cost, line total)
ITEMS = [
    ("17affb46", "6b9844dc", 1, 32000, 16000, 32000), ("ad3d5faa", "b36ffe23", 1, 32000, 16000, 32000),
    ("02461c27", "51b10437", 1, 32000, 16000, 32000), ("02461c27", "708718fb", 1, 32000, 16000, 32000),
    ("b7b09944", "6b9844dc", 1, 32000, 16000, 32000), ("d43173f7", "fb0565c1", 1, 32000, 16000, 32000),
    ("d43173f7", "2fe96e7c", 1, 32000, 16000, 32000), ("df3f6529", "2fe96e7c", 1, 32000, 16000, 32000),
    ("495a7579", "b36ffe23", 1, 32000, 16000, 32000), ("495a7579", "11c368aa", 1, 32000, 16000, 32000),
    ("c6ecaa34", "a776106d", 1, 32000, 16000, 32000), ("5bff8fd9", "51b10437", 1, 32000, 16000, 32000),
    ("31700d66", "51b10437", 1, 32000, 16000, 32000), ("c9425cd3", "708718fb", 1, 32000, 16000, 32000),
    ("68bb2fdb", "708718fb", 1, 32000, 16000, 32000), ("3038f3d0", "a776106d", 1, 32000, 16000, 32000),
    ("3038f3d0", "b11f39a1", 1, 32000, 16000, 32000), ("2958a555", "7838a1a6", 1, 32000, 16000, 32000),
    ("95ff14e5", "a776106d", 1, 32000, 16000, 32000), ("80bc6b23", "6b9844dc", 1, 32000, 16000, 32000),
    ("c0754cca", "11c368aa", 1, 32000, 16000, 32000), ("5778b9a9", "fb0565c1", 1, 32000, 16000, 32000),
    ("e7fc1d91", "b36ffe23", 1, 32000, 16000, 32000), ("46e7b59c", "2fe96e7c", 1, 32000, 16000, 32000),
    ("f226ee07", "7838a1a6", 2, 32000, 16000, 64000), ("f226ee07", "b11f39a1", 1, 32000, 16000, 32000),
    ("7f6de6b4", "fb0565c1", 1, 32000, 16000, 32000), ("7edab8f5", "11c368aa", 1, 32000, 16000, 32000),
    ("328cffe4", "b11f39a1", 1, 32000, 16000, 32000), ("a390a036", "d13c34c9", 1, 34000, 16500, 34000),
    ("7a8f4e47", "9264016b", 1, 34000, 16500, 34000), ("99b83a0d", "9264016b", 1, 34000, 16500, 34000),
    ("2c9fcc63", "7bf8f43d", 1, 34000, 16500, 34000), ("2c9fcc63", "cbb3b973", 1, 34000, 16500, 34000),
    ("6f8bf8db", "cbb3b973", 1, 34000, 16500, 34000), ("14f48efc", "2e030261", 1, 34000, 16500, 34000),
    ("ed57cb7f", "65d35d2b", 1, 34000, 16500, 34000), ("8044f2f4", "9264016b", 1, 34000, 16500, 34000),
    ("1b621ecb", "65d35d2b", 1, 34000, 16500, 34000), ("5139950e", "2e030261", 1, 34000, 16500, 34000),
    ("3c12162b", "d13c34c9", 1, 34000, 16500, 34000), ("0a5e626d", "c9eef57f", 1, 34000, 16500, 34000),
    ("c24e6095", "b705f1ae", 1, 34000, 16500, 34000), ("138ad317", "ad408d7d", 1, 34000, 16500, 34000),
    ("138ad317", "ac41e6b0", 1, 34000, 16500, 34000), ("4385270b", "cbb3b973", 1, 34000, 16500, 34000),
    ("f115cae1", "65d35d2b", 1, 34000, 16500, 34000), ("125a988f", "ac41e6b0", 1, 34000, 16500, 34000),
    ("4463af62", "ac41e6b0", 1, 34000, 16500, 34000), ("0cca798f", "b705f1ae", 1, 34000, 16500, 34000),
    ("1bb02356", "ad408d7d", 1, 34000, 16500, 34000), ("dee1d2b2", "c9eef57f", 1, 34000, 16500, 34000),
    ("5ff2bfd6", "c9eef57f", 1, 34000, 16500, 34000), ("b363000e", "7bf8f43d", 1, 34000, 16500, 34000),
    ("656ab23e", "d13c34c9", 1, 34000, 16500, 34000), ("56b9398e", "ad408d7d", 1, 34000, 16500, 34000),
    ("9958ac75", "2e030261", 1, 34000, 16500, 34000), ("9958ac75", "b705f1ae", 1, 34000, 16500, 34000),
    ("a5b8be43", "ad408d7d", 1, 34000, 16500, 34000), ("9d06c003", "7bf8f43d", 1, 34000, 16500, 34000),
]
# later payments on credit sales: (sid, amount, business_date, created Manila). Cash sales are paid at the till.
PAYMENTS = [
    ("17affb46", 32000, "2026-11-03", "2026-11-03 19:33"), ("31700d66", 32000, "2026-11-04", "2026-11-04 13:41"),
    ("c6ecaa34", 32000, "2026-11-04", "2026-11-04 13:42"), ("e7fc1d91", 32000, "2026-11-04", "2026-11-04 13:42"),
    ("02461c27", 50000, "2026-11-04", "2026-11-04 20:28"), ("02461c27", 14000, "2026-11-05", "2026-11-05 11:20"),
    ("68bb2fdb", 32000, "2026-11-05", "2026-11-05 20:24"), ("ad3d5faa", 32000, "2026-11-06", "2026-11-06 18:32"),
    ("5bff8fd9", 32000, "2026-11-06", "2026-11-06 18:36"), ("c0754cca", 32000, "2026-11-08", "2026-11-08 18:55"),
    ("df3f6529", 32000, "2026-11-09", "2026-11-09 17:56"), ("b7b09944", 32000, "2026-11-09", "2026-11-09 17:58"),
    ("d43173f7", 64000, "2026-11-09", "2026-11-09 19:48"), ("c9425cd3", 32000, "2026-11-09", "2026-11-09 19:48"),
    ("2958a555", 32000, "2026-11-09", "2026-11-09 19:48"), ("46e7b59c", 32000, "2026-11-09", "2026-11-09 19:48"),
    ("f226ee07", 32000, "2026-11-10", "2026-11-10 18:44"), ("7edab8f5", 32000, "2026-11-12", "2026-11-12 13:46"),
    ("4463af62", 34000, "2026-11-17", "2026-11-17 12:45"), ("f226ee07", 40000, "2026-11-17", "2026-11-17 21:14"),
    ("7a8f4e47", 34000, "2026-11-18", "2026-11-18 22:46"), ("14f48efc", 34000, "2026-11-19", "2026-11-19 08:46"),
    ("ed57cb7f", 34000, "2026-11-19", "2026-11-19 08:46"), ("2c9fcc63", 34000, "2026-11-19", "2026-11-19 12:11"),
    ("138ad317", 68000, "2026-11-19", "2026-11-19 12:39"), ("2c9fcc63", 34000, "2026-11-19", "2026-11-19 18:13"),
    ("c24e6095", 34000, "2026-11-20", "2026-11-20 20:17"), ("5139950e", 34000, "2026-11-21", "2026-11-21 20:14"),
    ("f115cae1", 34000, "2026-11-21", "2026-11-21 20:14"), ("1b621ecb", 34000, "2026-11-22", "2026-11-22 22:03"),
    ("99b83a0d", 30000, "2026-11-23", "2026-11-23 12:55"), ("125a988f", 34000, "2026-11-23", "2026-11-23 18:51"),
    ("3c12162b", 34000, "2026-11-24", "2026-11-24 11:49"), ("1bb02356", 34000, "2026-11-24", "2026-11-24 17:27"),
    ("f226ee07", 24000, "2026-11-24", "2026-11-24 17:27"), ("dee1d2b2", 34000, "2026-11-26", "2026-11-26 11:16"),
]
# stock movements: (pid, kind, delta, batch, created Manila)   -- all 81 rows
B1, B2 = "5e5c3cf4", "f5fec51d"
MOVES = [(pid, "opening", 3, B1, "2026-10-27 09:15:05") for pid in
         ["11c368aa", "b11f39a1", "a776106d", "708718fb", "7838a1a6", "b36ffe23", "fb0565c1", "6b9844dc", "2fe96e7c", "51b10437"]]
MOVES += [(p, "sale", d, None, t) for p, d, t in [
    ("6b9844dc", -1, "2026-10-27 11:36:55"), ("b36ffe23", -1, "2026-10-27 11:37:28"), ("51b10437", -1, "2026-10-27 11:38:06"),
    ("708718fb", -1, "2026-10-27 11:38:06"), ("6b9844dc", -1, "2026-10-27 11:41:03"), ("fb0565c1", -1, "2026-10-27 13:11:20"),
    ("2fe96e7c", -1, "2026-10-27 13:11:20"), ("2fe96e7c", -1, "2026-10-27 13:15:49"), ("11c368aa", -1, "2026-10-28 17:21:52"),
    ("b36ffe23", -1, "2026-10-28 17:21:52"), ("a776106d", -1, "2026-10-28 17:42:35"), ("51b10437", -1, "2026-10-28 18:08:12"),
    ("51b10437", -1, "2026-10-28 18:59:43"), ("708718fb", -1, "2026-10-28 19:16:27"), ("708718fb", -1, "2026-10-29 13:17:22"),
    ("b11f39a1", -1, "2026-10-29 19:14:07"), ("a776106d", -1, "2026-10-29 19:14:07"), ("7838a1a6", -1, "2026-10-29 19:37:39"),
    ("a776106d", -1, "2026-10-30 15:54:16"), ("6b9844dc", -1, "2026-10-30 18:32:42"), ("11c368aa", -1, "2026-10-30 18:33:07"),
    ("fb0565c1", -1, "2026-10-30 18:51:47"), ("b36ffe23", -1, "2026-10-30 18:57:24"), ("2fe96e7c", -1, "2026-10-31 20:51:17"),
    ("b11f39a1", -1, "2026-11-03 19:32:16"), ("7838a1a6", -2, "2026-11-03 19:32:16"), ("fb0565c1", -1, "2026-11-03 19:44:06"),
    ("11c368aa", -1, "2026-11-04 13:17:16"), ("b11f39a1", -1, "2026-11-06 18:31:43")]]
MOVES += [(p, "restock", 3, B2, t) for p, t in [
    ("2e030261", "2026-11-09 19:55:50"), ("ad408d7d", "2026-11-09 19:58:01"), ("65d35d2b", "2026-11-09 19:58:25"),
    ("9264016b", "2026-11-09 19:59:25"), ("ac41e6b0", "2026-11-09 20:02:25"), ("b705f1ae", "2026-11-09 20:04:44"),
    ("c9eef57f", "2026-11-09 20:06:00"), ("d13c34c9", "2026-11-09 20:06:36"), ("cbb3b973", "2026-11-09 20:07:37"),
    ("7bf8f43d", "2026-11-10 02:46:21")]]
MOVES += [(p, k, d, None, t) for p, k, d, t in [
    ("d13c34c9", "sale", -1, "2026-11-10 18:43:13"), ("9264016b", "sale", -1, "2026-11-10 18:50:41"),
    ("9264016b", "sale", -1, "2026-11-10 18:51:11"), ("7bf8f43d", "sale", -1, "2026-11-10 18:51:57"),
    ("cbb3b973", "sale", -1, "2026-11-10 18:51:57"), ("cbb3b973", "sale", -1, "2026-11-10 18:52:44"),
    ("2e030261", "sale", -1, "2026-11-10 18:53:54"), ("65d35d2b", "sale", -1, "2026-11-10 18:54:29"),
    ("9264016b", "sale", -1, "2026-11-13 08:36:14"), ("65d35d2b", "sale", -1, "2026-11-13 08:37:01"),
    ("2e030261", "sale", -1, "2026-11-13 16:43:53"), ("d13c34c9", "sale", -1, "2026-11-13 16:44:28"),
    ("c9eef57f", "sale", -1, "2026-11-13 16:44:56"), ("b705f1ae", "sale", -1, "2026-11-14 03:16:01"),
    ("ac41e6b0", "sale", -1, "2026-11-15 21:45:49"), ("ad408d7d", "sale", -1, "2026-11-15 21:45:49"),
    ("cbb3b973", "sale", -1, "2026-11-16 21:08:59"), ("65d35d2b", "sale", -1, "2026-11-16 21:09:23"),
    ("ac41e6b0", "sale", -1, "2026-11-17 12:43:44"), ("ac41e6b0", "sale", -1, "2026-11-17 12:44:57"),
    ("b705f1ae", "sale", -1, "2026-11-17 19:52:01"), ("ad408d7d", "sale", -1, "2026-11-17 21:01:24"),
    ("c9eef57f", "sale", -1, "2026-11-17 21:01:51"), ("c9eef57f", "sale", -1, "2026-11-19 08:45:34"),
    ("7bf8f43d", "sale", -1, "2026-11-19 18:15:43"), ("d13c34c9", "sale", -1, "2026-11-20 18:58:05"),
    ("ad408d7d", "sale", -1, "2026-11-22 07:54:36"), ("b705f1ae", "sale", -1, "2026-11-22 22:03:32"),
    ("2e030261", "sale", -1, "2026-11-22 22:03:32"), ("ad408d7d", "void", 1, "2026-11-25 07:05:27"),
    ("ad408d7d", "sale", -1, "2026-11-25 07:05:52"), ("7bf8f43d", "sale", -1, "2026-11-26 11:16:21")]]

# Owner's finance_report('2026-10-01', '2026-11-26') -> end (centavos), and the batch_statements() totals.
FIN_END = dict(gross=1980000, discounts=0, net=1980000, cogs=1023300, opex=74000, net_profit=882700, tax=0,
               cash=34000, receivables=208000, inventory=0, on_the_way=721400, owed_suppliers=0, tax_payable=0,
               capital=503900, paid_owner=503900, paid_company=1240800, retained=459500, distributions=423200,
               collected=1772000, sales=51, safe_to_distribute=34000, spare_cash=34000, inventory_reserve=0)
FIN_OCT_END = dict(net=768000, cogs=403120, net_profit=364880, cash=224000, receivables=544000, inventory=100780)
BATCH_STATEMENTS = {1: dict(received=30, sold=30, net=960000, cogs_goods=480000, cogs_fees=23900),
                    2: dict(received=30, sold=30, net=1020000, cogs_goods=495000, cogs_fees=24400),
                    3: dict(received=0, sold=0, net=0, goods=695000, fees=26400)}

# ---------------------------------------------------------------------------------------------
# 2. FRAMES
# ---------------------------------------------------------------------------------------------
LINE_BATCH = {"XBLACK MAX": 1, "Black TEO": 2, "BLXCK Signature": 3, "Device": 3}
BATCH_ID = {v[0]: k for k, v in BATCHES.items()}
prod = pd.DataFrame([(k, *v) for k, v in PRODUCTS.items()], columns=["pid", "line", "flavour", "price", "cost"])
prod["batch"] = prod["line"].map(LINE_BATCH)

sales = pd.DataFrame(SALES, columns=["sid", "bd", "ts", "status", "pm", "sub", "disc", "tot", "bal", "bk"])
sales["bd"] = pd.to_datetime(sales["bd"]); sales["ts"] = pd.to_datetime(sales["ts"])
done = sales[sales.status == "completed"].copy()
items = pd.DataFrame(ITEMS, columns=["sid", "pid", "q", "up", "uc", "ltot"]).merge(prod, on="pid")
items = items.merge(sales[["sid", "status", "bd", "ts", "pm"]], on="sid")
it = items[items.status == "completed"].copy()
pays = pd.DataFrame(PAYMENTS, columns=["sid", "amt", "bd", "ts"])
pays["bd"] = pd.to_datetime(pays["bd"])
moves = pd.DataFrame(MOVES, columns=["pid", "kind", "delta", "bid", "ts"])
moves["ts"] = pd.to_datetime(moves["ts"])
moves = moves.sort_values(["ts"], kind="stable").reset_index(drop=True)

# landed cost per piece = unit cost + batch fees / pieces received (B3: pieces ordered)
fees = {n: sum(BATCHES[BATCH_ID[n]][3:]) for n in (1, 2, 3)}
pieces_in = {1: 30, 2: 30, 3: sum(q for _, q, _ in ORDER_LINES_B3)}
fee_pp = {n: fees[n] / pieces_in[n] for n in fees}
prod["landed"] = prod["cost"] + prod["batch"].map(fee_pp)
it = it.merge(prod[["pid", "landed"]], on="pid")

M = {}           # metrics: name -> dict(value, unit, formula, as_of)
def put(name, value, unit, formula, as_of="2026-11-26"):
    v = float(value) if isinstance(value, (np.floating, np.integer)) else value
    M[name] = dict(value=round(v, 4) if isinstance(v, float) else v, unit=unit, formula=formula, as_of=as_of)
    return value

def peso(c): return c / P
def h(title): print(f"\n=== {title} ===")

# ---------------------------------------------------------------------------------------------
# 3. DATE RANGE, TRADING DAYS
# ---------------------------------------------------------------------------------------------
h("Date range and trading days")
cal_days = (TODAY - FIRST_DAY).days + 1
sale_days = done["bd"].nunique()
put("calendar_days", cal_days, "days", "26 Nov - 27 Oct + 1 (first stock and first sale 27 Oct)")
put("selling_days", sale_days, "days", "distinct business_date with >=1 completed sale")
print(f"first sale {done.ts.min()}, last sale {done.ts.max()}, calendar days {cal_days}, days with a sale {sale_days}")

# ---------------------------------------------------------------------------------------------
# 4. STOCK TIMELINE (running sum of stock_movements.delta) -> in-stock / empty time per product and shop
# ---------------------------------------------------------------------------------------------
def intervals(ev, start, end):
    """ev: DataFrame(ts, delta) sorted. Returns list of (t0, t1, level) from start to end."""
    out, lvl, t = [], 0, start
    for row in ev.itertuples():
        if row.ts > t:
            out.append((t, min(row.ts, end), lvl)); t = row.ts
        lvl += row.delta
    if end > t:
        out.append((t, end, lvl))
    return [(a, b, l) for a, b, l in out if b > a]

DAY = pd.Timedelta(days=1)
rows = []
for pid, g in moves.groupby("pid"):
    first = g.ts.min()
    iv = intervals(g[["ts", "delta"]], first, AS_OF)
    instock = sum((b - a) / DAY for a, b, l in iv if l > 0)
    empty = sum((b - a) / DAY for a, b, l in iv if l <= 0)
    # first time the shelf hit 0 (Blue Freeze: a 22 Nov sale was voided and re-rung on 25 Nov to the same
    # buyer, so its shelf is counted empty from 22 Nov; the 25-second "back in stock" is a correction)
    zero_since = next((a for a, b, l in iv if l <= 0), None)
    sold = -g.loc[g.kind.isin(["sale", "void"]), "delta"].sum()
    rows.append(dict(pid=pid, first=first, instock_d=instock, empty_d=empty, out_since=zero_since, sold=sold))
pt = pd.DataFrame(rows).merge(prod, on="pid")
pt["days_to_sell_out"] = (pt["out_since"] - pt["first"]) / DAY
pt["pace_instock"] = pt["sold"] / pt["instock_d"]

# shop-level total stock
shop_iv = intervals(moves[["ts", "delta"]], moves.ts.min(), AS_OF)
shop_instock = sum((b - a) / DAY for a, b, l in shop_iv if l > 0)
shop_empty_iv = [(a, b) for a, b, l in shop_iv if l <= 0]
shop_empty = sum((b - a) / DAY for a, b in shop_empty_iv)
put("shop_days_with_stock", shop_instock, "days", "time with total pieces on the shelf > 0, 27 Oct 09:15 -> 26 Nov 18:59")
put("shop_days_fully_empty", shop_empty, "days", "time with 0 pieces in the whole shop (6-9 Nov and since 26 Nov 11:16)")
print(f"shop had stock {shop_instock:.2f} days; fully empty {shop_empty:.2f} days:")
for a, b in shop_empty_iv:
    print(f"   empty {a} -> {b}  ({(b - a) / DAY:.2f} days)")

# ---------------------------------------------------------------------------------------------
# 5. SALES, PIECES, PRICE, DISCOUNTS, POCKET PRICE
# ---------------------------------------------------------------------------------------------
h("Sales, pieces, price, discounts")
gross = done["sub"].sum(); disc = done["disc"].sum(); net = done["tot"].sum()
pcs = it["q"].sum()
assert net == FIN_END["net"] and pcs == 60
put("gross_sales", peso(gross), "PHP", "sum(subtotal) of completed sales")
put("discounts", peso(disc), "PHP", "sum(discount) of completed sales")
put("net_sales", peso(net), "PHP", "gross - discounts (= finance_report net)")
put("completed_sales", len(done), "sales", "count(status='completed')")
put("pieces_sold", pcs, "pieces", "sum(quantity) of completed sale lines")
put("avg_price_per_piece", peso(net / pcs), "PHP", "net sales / pieces")
put("avg_ticket", peso(net / len(done)), "PHP", "net sales / completed sales")
put("pieces_per_sale", pcs / len(done), "pieces", "pieces / completed sales")
put("net_sales_per_calendar_day", peso(net / cal_days), "PHP/day", "net sales / 31 days")
put("net_sales_per_day_with_stock", peso(net / shop_instock), "PHP/day", "net sales / days the shop had stock")
put("pieces_per_day_with_stock", pcs / shop_instock, "pieces/day", "pieces / days the shop had stock")
list_check = (it["ltot"] == it["up"] * it["q"]).all() and (it["up"] == it["price"]).all()
put("lines_at_list_price_share", 1.0 if list_check else 0.0, "share", "line_total = unit price x qty = product price for every line")
voided = sales[sales.status == "voided"]
put("voided_sales", len(voided), "sales", "status='voided' (1 piece, re-rung 25 Nov)")
collected_total = FIN_END["collected"]
owed = done["bal"].sum()
pocket = {"list price": net / pcs, "discounts": -disc / pcs, "payment fees": 0.0,
          "still owed (not in hand)": -owed / pcs}
pocket["cash in hand per piece"] = sum(pocket.values())
for k, v in pocket.items():
    print(f"   pocket waterfall  {k:28s} PHP {peso(v):8.2f}")
put("pocket_cash_per_piece", peso(pocket["cash in hand per piece"]), "PHP", "(net sales - still owed) / pieces = collected / pieces")
put("leakage_uncollected_share", owed / net, "share", "still owed / net sales")

by_line = it.groupby("line").agg(pieces=("q", "sum"), net=("ltot", "sum"),
                                  cost=("uc", lambda s: (s * it.loc[s.index, "q"]).sum()))
print(by_line.assign(net=lambda d: d.net / P, cost=lambda d: d.cost / P))

# ---------------------------------------------------------------------------------------------
# 6. MARGINS (at cost and at landed cost)
# ---------------------------------------------------------------------------------------------
h("Gross margin")
cogs_cost = (it["q"] * it["uc"]).sum()
cogs_landed = (it["q"] * it["landed"]).sum()
assert round(cogs_landed) == FIN_END["cogs"]
put("cogs_at_cost", peso(cogs_cost), "PHP", "sum(qty x unit cost)")
put("cogs_landed", peso(cogs_landed), "PHP", "sum(qty x (unit cost + batch fees / pieces received))")
put("gross_margin_at_cost", (net - cogs_cost) / net, "share", "(net - cogs at cost) / net")
put("gross_margin_landed", (net - cogs_landed) / net, "share", "(net - landed cogs) / net")
put("gross_profit_landed", peso(net - cogs_landed), "PHP", "net - landed cogs")
put("landed_margin_per_piece_avg", peso((net - cogs_landed) / pcs), "PHP/piece", "(net - landed cogs) / pieces")
for n in (1, 2, 3):
    put(f"batch{n}_fees_per_piece", peso(fee_pp[n]), "PHP/piece", f"batch {n} fees / pieces ({fees[n] / P:.0f} / {pieces_in[n]})")
    put(f"batch{n}_fees_pct_goods", fees[n] / sum(q * c for _, q, c in ORDER_LINES_B3) if n == 3 else fees[n] / (30 * prod.loc[prod.batch == n, 'cost'].iloc[0]),
        "share", "fees / goods cost")
unit = prod.groupby(["batch", "line"]).agg(price=("price", "first"), cost=("cost", "first"), landed=("landed", "first")).reset_index()
unit["margin_landed"] = unit.price - unit.landed
unit["margin_pct"] = unit.margin_landed / unit.price
print(unit.assign(price=unit.price / P, cost=unit.cost / P, landed=(unit.landed / P).round(2), margin_landed=(unit.margin_landed / P).round(2)))

# ---------------------------------------------------------------------------------------------
# 7. EXPENSES, NET PROFIT, P&L BY MONTH
# ---------------------------------------------------------------------------------------------
h("Expenses and P&L by month")
exp = pd.DataFrame(EXPENSES, columns=["day", "cat", "amt", "bid"]); exp["day"] = pd.to_datetime(exp["day"])
exp["month"] = exp.day.dt.strftime("%Y-%m")
print(exp.pivot_table(index="cat", columns="month", values="amt", aggfunc="sum", fill_value=0) / P)
opex = exp.amt.sum()
net_profit = net - cogs_landed - opex
assert round(net_profit) == FIN_END["net_profit"]
put("operating_expenses", peso(opex), "PHP", "other 640 (9 Nov) + utilities 100 (24 Nov); no rent or salaries recorded")
put("net_profit", peso(net_profit), "PHP", "net sales - landed cogs - expenses - tax (0%)")
put("net_margin", net_profit / net, "share", "net profit / net sales")
put("tax_at_statutory_3pct", peso(0.03 * net), "PHP", "3% x net sales (app rate is 0%)")
it["month"] = it.bd.dt.strftime("%Y-%m")
pl = it.groupby("month").apply(lambda d: pd.Series(dict(days=0, pieces=d.q.sum(), net=d.ltot.sum(),
                                                          cogs=(d.q * d.landed).sum())), include_groups=False)
pl["days"] = [5, 26]
pl["opex"] = exp.groupby("month").amt.sum().reindex(pl.index, fill_value=0)
pl["net_profit"] = pl.net - pl.cogs - pl.opex
pl["net_per_day"] = pl.net / pl.days
print((pl[["net", "cogs", "opex", "net_profit", "net_per_day"]] / P).round(2).assign(pieces=pl.pieces, days=pl.days))
assert round(pl.loc["2026-10", "net_profit"]) == FIN_OCT_END["net_profit"]
put("oct_net_sales", peso(pl.loc["2026-10", "net"]), "PHP", "27-31 Oct (5 days)", "2026-10-31")
put("nov_net_sales", peso(pl.loc["2026-11", "net"]), "PHP", "1-26 Nov (26 days)")
put("oct_net_profit", peso(pl.loc["2026-10", "net_profit"]), "PHP", "Oct P&L", "2026-10-31")
put("nov_net_profit", peso(pl.loc["2026-11", "net_profit"]), "PHP", "Nov P&L to 26 Nov")

# ---------------------------------------------------------------------------------------------
# 8. BALANCE (finance_report as owner, rolled back)
# ---------------------------------------------------------------------------------------------
h("Balance on 26 Nov")
assets = FIN_END["cash"] + FIN_END["receivables"] + FIN_END["inventory"] + FIN_END["on_the_way"]
claims = FIN_END["tax_payable"] + FIN_END["owed_suppliers"] + FIN_END["capital"] + FIN_END["net_profit"] - FIN_END["distributions"]
assert assets == claims
for k in ["cash", "receivables", "inventory", "on_the_way", "owed_suppliers", "capital", "net_profit", "distributions",
          "retained", "safe_to_distribute"]:
    print(f"   {k:20s} PHP {peso(FIN_END[k]):10,.2f}")
    put(f"bal_{k}", peso(FIN_END[k]), "PHP", f"finance_report end.{k}")
put("bal_total_assets", peso(assets), "PHP", "cash + receivables + inventory + on the way (= capital + profit - distributions)")

# ---------------------------------------------------------------------------------------------
# 9. PER BATCH: pieces, landed cost, sell-through, payback, empty shelves, lost sales
# ---------------------------------------------------------------------------------------------
h("Per batch")
pays_all = pd.concat([
    done.loc[done.pm == "cash", ["sid", "tot", "bd"]].rename(columns={"tot": "amt"}),
    pays[["sid", "amt", "bd"]]])
sid_batch = it.groupby("sid").batch.first()
pays_all["batch"] = pays_all.sid.map(sid_batch)
bat = []
for n in (1, 2):
    bi = it[it.batch == n]
    arr = pt.loc[pt.batch == n, "first"].min()
    bpids = prod.loc[prod.batch == n, "pid"]
    last = moves.loc[moves.pid.isin(bpids) & (moves.kind == "sale"), "ts"].max()   # seconds precision
    cost_full = fees[n] + 30 * prod.loc[prod.batch == n, "cost"].iloc[0]
    exp_n = exp.loc[exp.bid == BATCH_ID[n], "amt"].sum()
    s = bi.sort_values("ts")
    s["cum_net"] = (s.ltot).cumsum(); s["cum_pcs"] = s.q.cumsum()
    covered_ts = s.loc[s.cum_net >= cost_full, "ts"].min()
    pb = pays_all[pays_all.batch == n].sort_values("bd"); pb["cum"] = pb.amt.cumsum()
    cash_cover = pb.loc[pb.cum >= cost_full, "bd"].min()
    d_since = (s.ts - arr) / DAY
    bat.append(dict(batch=n, line=bi.line.iloc[0], pieces=bi.q.sum(), received=30, arrived=arr, last_sale=last,
                    sell_through_days=(last - arr) / DAY, sell_through_pct=bi.q.sum() / 30,
                    sold_by_day4=int(s.loc[d_since <= 4, "q"].sum()), sold_by_day7=int(s.loc[d_since <= 7, "q"].sum()),
                    sold_by_day14=int(s.loc[d_since <= 14, "q"].sum()),
                    pace=bi.q.sum() / ((last - arr) / DAY), cost_full=cost_full, landed_pp=cost_full / 30,
                    net=bi.ltot.sum(), gross_profit=bi.ltot.sum() - cost_full, expenses=exp_n,
                    net_profit=bi.ltot.sum() - cost_full - exp_n,
                    days_to_cover_cost_sales=(covered_ts - arr) / DAY,
                    days_to_cover_cost_cash=(cash_cover - arr.normalize()) / DAY if pd.notna(cash_cover) else None,
                    credit_share=bi.loc[bi.pm == "unpaid", "ltot"].sum() / bi.ltot.sum()))
bat = pd.DataFrame(bat)
pd.set_option("display.width", 200); pd.set_option("display.max_columns", 30)
print(bat.T)
for r in bat.itertuples():
    n = r.batch
    put(f"batch{n}_pieces", r.pieces, "pieces", "pieces received = sold")
    put(f"batch{n}_cost_in_full", peso(r.cost_full), "PHP", "goods + shipping/tax/MOOE/other")
    put(f"batch{n}_landed_cost_per_piece", peso(r.landed_pp), "PHP", "cost in full / pieces received")
    put(f"batch{n}_sell_through_days", r.sell_through_days, "days", "arrival (first stock movement) -> last sale")
    put(f"batch{n}_sell_through_pct", r.sell_through_pct, "share", "pieces sold / received")
    put(f"batch{n}_sold_by_day7", r.sold_by_day7, "pieces", "pieces sold within 7 days of arrival")
    put(f"batch{n}_pace", r.pace, "pieces/day", "pieces / sell-through days")
    put(f"batch{n}_net_profit", peso(r.net_profit), "PHP", "net sales - cost in full - expenses charged")
    put(f"batch{n}_days_to_cover_cost_sales", r.days_to_cover_cost_sales, "days", "arrival -> cumulative net sales >= cost in full")
    put(f"batch{n}_days_to_cover_cost_cash", r.days_to_cover_cost_cash, "days", "arrival day -> cumulative cash collected >= cost in full")
    put(f"batch{n}_credit_share", r.credit_share, "share", "batch sales rung as not paid yet / batch net sales")
for r in bat.itertuples():
    put(f"batch{r.batch}_gross_margin_landed", (r.net - r.cost_full) / r.net, "share", "(batch net sales - cost in full) / net sales")
put("price_change_b1_to_b2", 34000 / 32000 - 1, "share", "340 / 320 - 1")
put("cost_change_b1_to_b2", 16500 / 16000 - 1, "share", "165 / 160 - 1")
put("landed_margin_change_b1_to_b2", peso(unit.loc[1, "margin_landed"] - unit.loc[0, "margin_landed"]), "PHP/piece", "166.87 - 152.03")
b3_cost = sum(q * c for _, q, c in ORDER_LINES_B3) + fees[3]
put("batch3_cost_in_full", peso(b3_cost), "PHP", "30 x 165 + 10 x 200 + 264 shipping; paid 25 Nov, company fund")
put("batch3_pieces", pieces_in[3], "pieces", "30 BLXCK Signature (3 x 10 flavours) + 10 devices")

h("Empty shelves per product")
pt["batch_last_sale"] = pt.batch.map(dict(zip(bat.batch, bat.last_sale)))
pt["empty_in_window_d"] = ((pt.batch_last_sale - pt.out_since) / DAY).clip(lower=0)
show = pt[pt.batch.isin([1, 2])].sort_values(["batch", "days_to_sell_out"])
print(show[["batch", "flavour", "sold", "days_to_sell_out", "instock_d", "empty_d", "empty_in_window_d", "pace_instock"]]
      .round(2).to_string(index=False))
put("flavours_sold_out", int(pt.out_since.notna().sum()), "products", "products stocked so far that are now at 0 (all 20)")
put("median_days_to_sell_out_3pcs", float(show.days_to_sell_out.median()), "days", "median over 20 flavours, arrival -> 3rd piece")

# Assortment check: pieces/day and pieces per flavour-day by how many flavours were on the shelf.
# Piecewise-constant periods within each batch's selling window.
seg = []
for n in (1, 2):
    arr, last = bat.loc[bat.batch == n, "arrived"].iloc[0], bat.loc[bat.batch == n, "last_sale"].iloc[0]
    pids = prod.loc[prod.batch == n, "pid"].tolist()
    ev = moves[moves.pid.isin(pids)]
    cuts = sorted(set([arr, last] + ev.loc[(ev.ts > arr) & (ev.ts < last), "ts"].tolist()))
    lv = {p: 0 for p in pids}
    evs = ev.sort_values("ts").itertuples()
    pending = list(ev.sort_values("ts").itertuples())
    k = 0
    for a, b in zip(cuts[:-1], cuts[1:]):
        while k < len(pending) and pending[k].ts <= a:
            lv[pending[k].pid] += pending[k].delta; k += 1
        nflav = sum(1 for v in lv.values() if v > 0)
        sold = int(-ev.loc[(ev.ts > a) & (ev.ts <= b) & (ev.kind.isin(["sale", "void"])), "delta"].sum())
        seg.append(dict(batch=n, a=a, b=b, days=(b - a) / DAY, nflav=nflav, sold=sold))
seg = pd.DataFrame(seg)
seg["band"] = pd.cut(seg.nflav, [0, 3, 6, 10], labels=["1-3 flavours", "4-6 flavours", "7-10 flavours"])
band = seg.groupby("band", observed=True).apply(lambda d: pd.Series(dict(days=d.days.sum(), pieces=d.sold.sum(),
                                                                         flavour_days=(d.days * d.nflav).sum())), include_groups=False)
band["pieces_per_day"] = band.pieces / band.days
band["pieces_per_flavour_day"] = band.pieces / band.flavour_days
print(band.round(3))
# sensitivity: drop the first 24 hours after each arrival (launch rush)
arrivals = dict(zip(bat.batch, bat.arrived))
seg_x = seg[seg.a >= seg.batch.map(arrivals) + DAY]
band_x = seg_x.groupby("band", observed=True).apply(lambda d: pd.Series(dict(days=d.days.sum(), pieces=d.sold.sum(),
                                                                             flavour_days=(d.days * d.nflav).sum())), include_groups=False)
band_x["pieces_per_day"] = band_x.pieces / band_x.days
band_x["pieces_per_flavour_day"] = band_x.pieces / band_x.flavour_days
print("excluding the first 24 h after each arrival:"); print(band_x.round(3))
put("pace_7to10_flavours_ex_launch", band_x.loc["7-10 flavours", "pieces_per_day"], "pieces/day", "as above, first 24 h after each arrival left out")
for b, r in band.iterrows():
    put(f"pace_when_{b.replace(' ', '_').replace('-', 'to')}", r.pieces_per_day, "pieces/day",
        "pieces sold / days with that many flavours on the shelf (both batches)")

h("Sales lost to empty shelves (estimates)")
gp_pp = (net - cogs_landed) / pcs
shop_pace = pcs / shop_instock
lost1_pcs = shop_pace * shop_empty
put("shop_pace_with_stock", shop_pace, "pieces/day", "60 pieces / days the shop had stock")
put("lost_L1_shop_empty_pieces", lost1_pcs, "pieces", "shop pace x days fully empty")
put("lost_L1_shop_empty_gross_profit", peso(lost1_pcs * gp_pp), "PHP", "x avg landed margin per piece")
put("lost_L1_shop_empty_net_sales", peso(lost1_pcs * net / pcs), "PHP", "x avg price")
put("gross_profit_lost_per_empty_shop_day", peso(shop_pace * gp_pp), "PHP/day", "shop pace x landed margin per piece")
# L2: flavour-level, within each batch's own selling window, line-pooled in-stock rate, no substitution (upper bound)
l2 = []
for n in (1, 2):
    s = seg[seg.batch == n]
    rate = s.sold.sum() / (s.days * s.nflav).sum()
    empty_fd = (s.days * (10 - s.nflav)).sum()
    m = (prod.loc[prod.batch == n, "price"].iloc[0] - prod.loc[prod.batch == n, "landed"].iloc[0])
    l2.append(dict(batch=n, rate_per_flavour_day=rate, empty_flavour_days=empty_fd, lost_pcs=rate * empty_fd,
                   lost_gp=rate * empty_fd * m))
l2 = pd.DataFrame(l2); print(l2.round(2))
put("lost_L2_flavour_empty_pieces_upper", l2.lost_pcs.sum(), "pieces",
    "per batch: pieces / flavour-days in stock x flavour-days empty inside the selling window (no substitution)")
put("lost_L2_flavour_empty_gross_profit_upper", peso(l2.lost_gp.sum()), "PHP", "x the batch's landed margin per piece")
put("gross_profit_lost_per_cycle_if_ordered_at_sell_out_7d", peso(7 * shop_pace * gp_pp), "PHP",
    "7 lead days x shop pace x landed margin: the cost of each order placed when the shelf is already empty")
put("gross_profit_lost_per_empty_shop_day_full_shelf", peso(band.loc["7-10 flavours", "pieces_per_day"] * gp_pp), "PHP/day",
    "pace with 7-10 flavours on the shelf x landed margin (a fresh batch)")
# L2 middle: had 7+ flavours stayed on the shelf the whole selling window (full-shelf pace without the launch day)
full_pace = band_x.loc["7-10 flavours", "pieces_per_day"]
mid = sum(max(0.0, full_pace * r.sell_through_days - r.pieces) *
          (prod.loc[prod.batch == r.batch, "price"].iloc[0] - prod.loc[prod.batch == r.batch, "landed"].iloc[0])
          for r in bat.itertuples())
mid_pcs = sum(max(0.0, full_pace * r.sell_through_days - r.pieces) for r in bat.itertuples())
put("lost_L2_mid_pieces", mid_pcs, "pieces", "sum over B1, B2 of (full-shelf pace ex launch x selling-window days - pieces sold)")
put("lost_L2_mid_gross_profit", peso(mid), "PHP", "x the batch's landed margin per piece")
print(f"   L1 shop empty: {lost1_pcs:.1f} pcs, PHP {peso(lost1_pcs * gp_pp):,.0f} GP | L2 mid {mid_pcs:.1f} pcs PHP {peso(mid):,.0f} | "
      f"L2 upper {l2.lost_pcs.sum():.1f} pcs PHP {peso(l2.lost_gp.sum()):,.0f}")
# L3: current gap until Batch 3 arrives (scenarios on lead time from the 25 Nov order)
out_now = shop_empty_iv[-1][0]
for L in (5, 7, 10):
    arrive = pd.Timestamp("2026-11-25") + pd.Timedelta(days=L) + pd.Timedelta(hours=12)
    d = (arrive - out_now) / DAY
    put(f"lost_current_gap_gp_if_lead_{L}d", peso(d * shop_pace * gp_pp), "PHP",
        f"(25 Nov + {L} d, noon) - 26 Nov 11:16 = {d:.1f} empty days x shop pace x margin")
    print(f"   lead {L:2d} d: empty {d:4.1f} days -> gross profit lost PHP {peso(d * shop_pace * gp_pp):,.0f}")

# How the app's current pace reads the same history (lib/restock.ts: sold in the last 28 days / min(28, days
# since first stocked), empty days included) against the in-stock pace above.
h("App pace (28 days, empty days counted) vs in-stock pace")
win0 = AS_OF - pd.Timedelta(days=SETTINGS["pace_window_days"])
sale_mv = moves[moves.kind.isin(["sale", "void"])]
app = []
for r in pt[pt.batch.isin([1, 2])].itertuples():
    sold28 = -sale_mv.loc[(sale_mv.pid == r.pid) & (sale_mv.ts > win0), "delta"].sum()
    days = min(SETTINGS["pace_window_days"], (AS_OF - r.first) / DAY)
    app.append(dict(flavour=r.flavour, batch=r.batch, app_pace=sold28 / days, instock_pace=r.pace_instock))
app = pd.DataFrame(app); app["ratio"] = app.instock_pace / app.app_pace.replace(0, np.nan)
print(app.round(3).to_string(index=False))
put("app_pace_understatement_median", float(app.ratio.median()), "x", "median over 20 flavours of in-stock pace / app 28-day pace")
put("app_pace_understatement_max", float(app.ratio.max()), "x", "largest ratio (a fast flavour that sold out early)")
bt = app[app.batch == 2]
put("black_teo_app_pace_range", f"{bt.app_pace.min():.2f}-{bt.app_pace.max():.2f}", "pieces/day", "app pace of the 10 Black TEO flavours")
put("black_teo_instock_pace_range", f"{bt.instock_pace.min():.2f}-{bt.instock_pace.max():.2f}", "pieces/day", "in-stock pace of the same flavours")
put("flavours_app_pace_zero", int((app.app_pace == 0).sum()), "flavours", "flavours whose 28-day window holds no sale (pace 0 -> 'idle')")

# ---------------------------------------------------------------------------------------------
# 10. CONCENTRATION (Pareto)
# ---------------------------------------------------------------------------------------------
h("Pareto")
val = it.groupby("pid").ltot.sum().sort_values(ascending=False)
cum = val.cumsum() / val.sum()
n80_value = int((cum < 0.8).sum() + 1)
put("products_for_80pct_sales_value", n80_value, "products", f"of {len(val)} products that sold (every flavour sold exactly 3)")
sp = show.set_index("pid").pace_instock.sort_values(ascending=False)
cs = sp.cumsum() / sp.sum()
n80_speed = int((cs < 0.8).sum() + 1)
put("flavours_for_80pct_speed", n80_speed, "flavours", "rank by in-stock pace (3 pcs / in-stock days); cumulative share of summed pace")
top20 = sp.head(4).sum() / sp.sum()
put("top20pct_flavours_share_of_speed", top20, "share", "top 4 of 20 flavours' share of summed in-stock pace")
for n in (1, 2):
    q_ = show.loc[show.batch == n, "pace_instock"]
    put(f"batch{n}_fastest_to_slowest_pace", q_.max() / q_.min(), "x", "fastest / slowest flavour in-stock pace within the line")
put("all_fastest_to_slowest_pace", show.pace_instock.max() / show.pace_instock.min(), "x", "across both lines")
cv = show.days_to_sell_out.std() / show.days_to_sell_out.mean()
put("sell_out_days_cv", cv, "ratio", "std / mean of days to sell out 3 pieces across 20 flavours")
print(f"by value: {n80_value} of {len(val)} products make 80% (supply-capped: 3 each). "
      f"by speed: {n80_speed} of 20 flavours make 80% of pace; top 4 = {top20:.0%}")
print(show.sort_values("pace_instock", ascending=False)[["batch", "flavour", "days_to_sell_out", "pace_instock"]].round(2).to_string(index=False))

# ---------------------------------------------------------------------------------------------
# 11. CREDIT: share, collections, DSO, still owed
# ---------------------------------------------------------------------------------------------
h("Credit and collections")
cr = done[done.pm == "unpaid"].copy()
put("credit_share_value", cr.tot.sum() / net, "share", "sales rung as not paid yet / net sales")
put("credit_share_count", len(cr) / len(done), "share", "credit sales / completed sales")
lastpay = pays.groupby("sid").bd.max()
cr["last_pay"] = cr.sid.map(lastpay)
paid = cr[cr.bal == 0].copy()
paid["days"] = (paid.last_pay - paid.bd) / DAY
d = paid.days
put("credit_sales_fully_paid", len(paid), "sales", "credit sales with balance 0")
put("days_to_collect_median", d.median(), "days", "sale business_date -> last payment business_date, fully paid credit sales")
put("days_to_collect_mean", d.mean(), "days", "same, mean")
put("days_to_collect_value_weighted", (d * paid.tot).sum() / paid.tot.sum(), "days", "same, weighted by sale value")
for q in (0.8, 0.9, 0.95):
    put(f"days_to_collect_p{int(q * 100)}", float(np.percentile(d, q * 100)), "days", f"{int(q * 100)}th percentile (linear)")
put("share_collected_within_7_days", float((d <= 7).mean()), "share", "fully paid credit sales collected within 7 days (percentile rank of 7 days)")
put("share_collected_within_14_days", float((d <= 14).mean()), "share", "same, within 14 days")
put("one_default_680_vs_gross_profit", 68000 / (net - cogs_landed), "share", "the largest open balance (680) / gross profit to date")
put("days_to_collect_max", d.max(), "days", "slowest fully paid credit sale")
put("credit_paid_same_day_share", (d == 0).mean(), "share", "fully paid credit sales collected the same day")
print(f"days to collect (n={len(d)}): min {d.min():.0f}, median {d.median():.0f}, mean {d.mean():.1f}, "
      f"p80 {np.percentile(d, 80):.1f}, p90 {np.percentile(d, 90):.1f}, max {d.max():.0f}")
print(pd.cut(d, [-1, 0, 7, 14, 30], labels=["same day", "1-7", "8-14", "15-30"]).value_counts().sort_index())
cr["batch"] = cr.sid.map(sid_batch)
by_b = paid.assign(batch=paid.sid.map(sid_batch)).groupby("batch").days.agg(["count", "median", "mean"])
print("by batch:\n", by_b.round(1))
for b, r in by_b.iterrows():
    put(f"batch{b}_days_to_collect_median", r["median"], "days", "credit sales of the batch, fully paid")
open_ = cr[cr.bal > 0].copy()
open_["age"] = (TODAY - open_.bd) / DAY
put("still_owed", peso(open_.bal.sum()), "PHP", "sum(balance) of completed sales")
put("still_owed_sales", len(open_), "sales", "sales with a balance")
put("still_owed_buyers", open_.bk.nunique(), "buyers", "distinct buyers with a balance")
put("still_owed_share_net_sales", open_.bal.sum() / net, "share", "still owed / net sales")
put("still_owed_largest_buyer_share", open_.groupby("bk").bal.sum().max() / open_.bal.sum(), "share", "largest single buyer's balance / still owed")
age_b = pd.cut(open_.age, [-1, 7, 30, 999], labels=["0-7 days", "8-30 days", "over 30 days"])
ab = open_.groupby(age_b, observed=False).bal.sum() / P
print("still owed by age:\n", ab)
put("still_owed_0_7_days", ab.get("0-7 days", 0), "PHP", "age = 26 Nov - sale day")
put("still_owed_8_30_days", ab.get("8-30 days", 0), "PHP", "age = 26 Nov - sale day")
put("still_owed_oldest_age", open_.age.max(), "days", "oldest open sale")
put("still_owed_value_weighted_age", (open_.age * open_.bal).sum() / open_.bal.sum(), "days", "balance-weighted age")
# buyers
bk = done.groupby("bk").agg(n=("sid", "count"), v=("tot", "sum"))
put("distinct_buyers", len(bk), "buyers", "distinct (pseudonymous) buyers on completed sales")
put("repeat_buyers", int((bk.n >= 2).sum()), "buyers", "buyers with >= 2 sales")
put("repeat_buyer_sales_share", bk.loc[bk.n >= 2, "v"].sum() / net, "share", "net sales from repeat buyers / net sales")
put("buyers_ever_on_credit_share", cr.bk.nunique() / len(bk), "share", "buyers with >= 1 credit sale / buyers")

# daily balances -> DSO, DIO, DPO, CCC, invested capital
h("Working capital (daily end-of-day balances)")
days = pd.date_range(FIRST_DAY, TODAY, freq="D")
eod = []
for dday in days:
    end = dday + DAY
    ar = cr.loc[cr.bd <= dday, "tot"].sum() - pays.loc[pays.bd <= dday, "amt"].sum()
    inv = 0.0
    m = moves[moves.ts < end].groupby("pid").delta.sum()
    for pid, lvl in m.items():
        if lvl > 0:
            inv += lvl * prod.loc[prod.pid == pid, "landed"].iloc[0]
    otw = b3_cost if dday >= pd.Timestamp("2026-11-25") else 0
    payables = 0   # every batch was paid on its arrival day (B1, B2) or its order day (B3)
    eod.append(dict(day=dday, ar=ar, inv=inv, otw=otw, ap=payables))
eod = pd.DataFrame(eod).set_index("day")
assert round(eod.iloc[-1].ar) == FIN_END["receivables"]
assert abs(eod.loc["2026-10-31", "inv"] - FIN_OCT_END["inventory"]) < 1 and eod.loc["2026-10-31", "ar"] == FIN_OCT_END["receivables"]
sales_pd = net / cal_days; cogs_pd = cogs_landed / cal_days
dso_end = eod.iloc[-1].ar / sales_pd
dso_avg = eod.ar.mean() / sales_pd
dio_avg = eod.inv.mean() / cogs_pd
dpo = eod.ap.mean() / cogs_pd
prepaid_avg = eod.otw.mean() / cogs_pd
put("dso_end", dso_end, "days", "receivables 26 Nov / (net sales / 31)")
put("dso_avg", dso_avg, "days", "average daily receivables / (net sales / 31)")
put("dio_avg", dio_avg, "days", "average daily inventory at landed cost / (landed cogs / 31)")
put("dio_end", 0.0, "days", "inventory 26 Nov is 0 (sold out)")
put("dpo", dpo, "days", "payables 0: suppliers paid on arrival (B1, B2) or at order (B3)")
put("ccc_avg", dso_avg + dio_avg - dpo, "days", "DSO avg + DIO avg - DPO")
put("prepaid_stock_days_avg", prepaid_avg, "days", "average stock paid but on the way / (cogs / 31) (adds to the cycle)")
print(f"DSO end {dso_end:.1f}, DSO avg {dso_avg:.1f}, DIO avg {dio_avg:.1f}, DPO {dpo:.1f}, CCC {dso_avg + dio_avg - dpo:.1f}; "
      f"prepaid on the way {prepaid_avg:.2f} days")
# per piece cash-to-cash: supplier payment day -> day the piece's money came in (still owed: counted to 26 Nov)
paid_day = {1: pd.Timestamp("2026-10-27"), 2: pd.Timestamp("2026-11-09")}
cash_in = {}
for s in done.itertuples():
    if s.pm == "cash":
        cash_in[s.sid] = s.bd
    elif s.bal == 0:
        cash_in[s.sid] = lastpay[s.sid]
    else:
        cash_in[s.sid] = TODAY
pc = it.assign(cin=it.sid.map(cash_in))
pc["c2c"] = (pc.cin - pc.batch.map(paid_day)) / DAY
pc["shelf"] = (pc.ts - pc.batch.map(dict(zip(bat.batch, bat.arrived)))) / DAY
w = pc.q
put("cash_to_cash_days_per_piece", (pc.c2c * w).sum() / w.sum(), "days", "mean over pieces: money-in day - supplier payment day (open balances to 26 Nov)")
put("shelf_days_per_piece", (pc.shelf * w).sum() / w.sum(), "days", "mean over pieces: sale time - batch arrival")
for n in (1, 2):
    s = pc[pc.batch == n]
    put(f"batch{n}_cash_to_cash_days", (s.c2c * s.q).sum() / s.q.sum(), "days", "per-piece mean, this batch")
    put(f"batch{n}_shelf_days_per_piece", (s.shelf * s.q).sum() / s.q.sum(), "days", "per-piece mean, this batch")
print(pc.assign(c2c_w=pc.c2c * pc.q, sh_w=pc.shelf * pc.q).groupby("batch")[["c2c_w", "sh_w", "q"]].sum()
      .pipe(lambda d: pd.DataFrame(dict(cash_to_cash=d.c2c_w / d.q, shelf_days=d.sh_w / d.q))).round(1))

# ---------------------------------------------------------------------------------------------
# 12. ORDERS: dates, intervals, cover, gaps
# ---------------------------------------------------------------------------------------------
h("Orders")
order_days = [pd.Timestamp("2026-10-27"), pd.Timestamp("2026-11-09"), pd.Timestamp("2026-11-25")]  # coalesce(ordered_on, received_on)
iv_ = np.diff([d.toordinal() for d in order_days])
put("order_interval_mean", iv_.mean(), "days", f"mean gap between order days {list(map(int, iv_))} (B1, B2 have no order day: received day used)")
put("order_interval_sd", iv_.std(ddof=1), "days", "sample std of the 2 gaps")
put("lead_time_observations", 0, "orders", "batches with both ordered_on and received_on")
put("batch3_days_on_the_way", (AS_OF - pd.Timestamp("2026-11-25")) / DAY, "days", "25 Nov 00:00 -> 26 Nov 18:59")
put("cover_days_mean", bat.sell_through_days.mean(), "days", "mean sell-through of a 30-piece batch (B1, B2)")
put("cover_days_sd", bat.sell_through_days.std(ddof=1), "days", "sample std")
gap12 = shop_empty_iv[0]
put("empty_gap_b1_to_b2", (gap12[1] - gap12[0]) / DAY, "days", "B1 last piece 6 Nov 18:31 -> B2 stocked 9 Nov 19:55")
put("batch3_ordered_before_b2_sold_out", (pd.Timestamp("2026-11-26 11:16") - pd.Timestamp("2026-11-25")) / DAY, "days",
    "order day 25 Nov -> B2 last piece 26 Nov 11:16")
# what the data implies today with the current plan's formula (pace x days)
L_set, buf, cov = SETTINGS["restock_lead_days"], SETTINGS["restock_buffer_days"], SETTINGS["restock_cover_days"]
put("implied_reorder_point_shop", shop_pace * (L_set + buf), "pieces", "shop pace x (7 lead + 3 buffer)")
put("implied_order_size_shop", shop_pace * (L_set + buf + cov), "pieces", "shop pace x (7 + 3 + 14)")
print(f"order days {[d.date().isoformat() for d in order_days]}, gaps {list(map(int, iv_))}; cover {bat.sell_through_days.round(1).tolist()} days; "
      f"implied ROP {shop_pace * (L_set + buf):.1f} pcs, order {shop_pace * (L_set + buf + cov):.1f} pcs")

# ---------------------------------------------------------------------------------------------
# 13. OWNER CAPITAL, DISTRIBUTIONS, ROIC proxy
# ---------------------------------------------------------------------------------------------
h("Capital, distributions, ROIC proxy")
put("owner_capital", peso(FIN_END["capital"]), "PHP", "capital entries 0 + Batch 1 paid with owner's money 5,039")
put("distributions", peso(FIN_END["distributions"]), "PHP", "25 Nov: owner 2,821.33, manager 1,410.67 (2:1)")
put("payout_ratio", FIN_END["distributions"] / FIN_END["net_profit"], "share", "distributions / net profit to date")
put("inventory_reserve_decisions", len(SET_ASIDES), "decisions", "fund_set_asides rows: 0; 7,194; 5,194; 7,250; 7,014")
ic = eod.ar + eod.inv + eod.otw - eod.ap
put("invested_capital_avg", peso(ic.mean()), "PHP", "mean daily (receivables + inventory + on the way - payables)")
put("invested_capital_end", peso(ic.iloc[-1]), "PHP", "26 Nov: 2,080 + 0 + 7,214")
roic_p = net_profit / ic.mean()
put("roic_period", roic_p, "share", "net profit (31 days, tax 0%) / avg invested capital")
put("roic_annualised_simple", roic_p * 365 / cal_days, "share", "x 365/31 (not compounded)")
put("roic_period_with_3pct_tax", (net_profit - 0.03 * net) / ic.mean(), "share", "(net profit - 3% x net sales) / avg invested capital")
put("capital_turnover_period", net / ic.mean(), "x", "net sales / avg invested capital (31 days)")
print(f"avg invested capital PHP {peso(ic.mean()):,.0f}; ROIC 31 days {roic_p:.0%}, annualised x{roic_p * 365 / cal_days:.1f}; "
      f"= margin {net_profit / net:.1%} x turnover {net / ic.mean():.2f}")

put("on_the_way_share_of_assets", FIN_END["on_the_way"] / assets, "share", "stock on the way / total assets")
put("lost_per_cycle_vs_gross_profit_to_date", (7 * shop_pace * gp_pp) / (net - cogs_landed), "share",
    "gross profit lost per 7-day empty gap / gross profit to date")
put("lost_L1_vs_gross_profit_to_date", (lost1_pcs * gp_pp) / (net - cogs_landed), "share", "L1 / gross profit to date")
put("lost_L2_mid_vs_gross_profit_to_date", mid / (net - cogs_landed), "share", "L2 middle / gross profit to date")
put("full_shelf_vs_thin_shelf_pace", band.loc["7-10 flavours", "pieces_per_day"] / band.loc["1-3 flavours", "pieces_per_day"], "x",
    "pace with 7-10 flavours / pace with 1-3 flavours")
put("days_of_b3_at_shop_pace", pieces_in[3] / shop_pace, "days", "40 pieces / shop pace with stock")
put("days_of_b3_at_full_shelf_pace", pieces_in[3] / full_pace, "days", "40 pieces / full-shelf pace ex launch")

# weekday / hour profile (pieces)
h("When it sells")
it["wd"] = it.ts.dt.day_name().str[:3]; it["hr"] = it.ts.dt.hour
print(it.groupby("wd").q.sum().reindex(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).to_dict())
print(pd.cut(it.hr, [-1, 11, 16, 23], labels=["before noon", "12-4 pm", "5-11 pm"]).value_counts().sort_index().to_dict())
put("share_pieces_after_5pm", (it.loc[it.hr >= 17, "q"].sum() / pcs), "share", "pieces rung 17:00-23:59")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "baseline_metrics.json")
with open(out, "w") as f:
    json.dump(M, f, indent=1, default=str)
print(f"\n{len(M)} metrics written to {out}")
