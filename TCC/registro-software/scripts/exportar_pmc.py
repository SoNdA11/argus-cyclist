#!/usr/bin/env python3
"""Exporta a série diária do PMC (CTL/ATL/TSB) do banco do perfil para CSV.

Reproduz a lógica de internal/service/fit/metrics.go (CalculatePMC):
constantes de 42 e 7 dias, TSB calculado antes da atualização do dia.
Uso: python3 -I exportar_pmc.py <banco.db> <saida.csv>
"""
import csv
import sqlite3
import sys
from collections import defaultdict
from datetime import date, timedelta

db, out = sys.argv[1], sys.argv[2]
con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
rows = con.execute(
    "SELECT date(created_at), tss FROM activities "
    "WHERE deleted_at IS NULL AND duration >= 600 AND tss > 0"
).fetchall()

daily = defaultdict(float)
for d, tss in rows:
    daily[date.fromisoformat(d)] += tss

start, end = min(daily), date(2026, 10, 31)
ctl = atl = 0.0
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["dia", "data", "tss", "ctl", "atl", "tsb"])
    d, i = start, 0
    while d <= end:
        tss = daily.get(d, 0.0)
        tsb = ctl - atl
        ctl += (tss - ctl) / 42
        atl += (tss - atl) / 7
        w.writerow([i, d.isoformat(), round(tss, 1), round(ctl, 2), round(atl, 2), round(tsb, 2)])
        d += timedelta(days=1)
        i += 1
print(f"{start} -> {end}: {i} dias, {len(rows)} sessões")
