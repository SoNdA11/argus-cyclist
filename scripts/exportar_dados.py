#!/usr/bin/env python3
"""Gera data/dados.js com os dados reais usados nos gráficos da apresentação.

Fontes (somente leitura):
  - TCC/registro-software/figuras/girona-sessao.csv  (sessão de 27/04, via fit2csv)
  - TCC/registro-software/figuras/pmc-dados.csv      (PMC, via exportar_pmc.py)
  - workouts/gpx/Geraardsbergen_To_Leberg.gpx        (perfil e suavização)
  - users_data/<perfil>.db                           (volume mensal)

O resultado é um arquivo JavaScript (window.ARGUS_DATA = {...}) para que o
deck abra direto por file://, sem servidor e sem fetch.

Uso (a partir da raiz do repositório):
  python3 -I TCC/apresentacao/scripts/exportar_dados.py
"""
import csv
import json
import math
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TCC = ROOT / "TCC" / "registro-software"
OUT = ROOT / "TCC" / "apresentacao" / "data" / "dados.js"
DB = ROOT / "users_data" / "argus_data_1773227037777591881.db"


def girona():
    rows = list(csv.DictReader(open(TCC / "figuras" / "girona-sessao.csv")))
    out = {"km": [], "alt": [], "power": [], "hr": []}
    for r in rows:
        out["km"].append(round(float(r["dist_km"]), 3))
        out["alt"].append(round(float(r["alt_m"]), 1))
        out["power"].append(int(r["power_w"]))
        out["hr"].append(None if r["hr_bpm"] == "nan" else int(r["hr_bpm"]))
    return out


def pmc():
    rows = list(csv.DictReader(open(TCC / "figuras" / "pmc-dados.csv")))
    return {k: [r[k] if k == "data" else float(r[k]) for r in rows]
            for k in ("data", "tss", "ctl", "atl", "tsb")}


def haversine3d(a, b):
    r = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    d = 2 * r * math.asin(math.sqrt(h))
    return math.hypot(d, b[2] - a[2])


def leberg():
    """Perfil e inclinação bruta x suavizada (mesma regra de gpx/service.go)."""
    t = ET.parse(ROOT / "workouts" / "gpx" / "Geraardsbergen_To_Leberg.gpx")
    ns = t.getroot().tag.split("}")[0] + "}"
    pts = [(float(p.get("lat")), float(p.get("lon")), float(p.find(ns + "ele").text))
           for p in t.iter(ns + "trkpt")]
    dist = [0.0]
    for a, b in zip(pts, pts[1:]):
        dist.append(dist[-1] + haversine3d(a, b))
    n = len(pts)

    def grade(i, w, clamp):
        s, e = max(0, i - w), min(n - 1, i + w)
        dd = dist[e] - dist[s]
        if dd <= (10.0 if w else 0.5):
            return 0.0
        g = (pts[e][2] - pts[s][2]) / dd * 100
        return max(-clamp, min(clamp, g)) if clamp else g

    def raw_grade(i):  # entre pontos consecutivos, sem janela nem limite
        if i == 0:
            return 0.0
        dd = dist[i] - dist[i - 1]
        return (pts[i][2] - pts[i - 1][2]) / dd * 100 if dd > 0.5 else 0.0

    raw = [raw_grade(i) for i in range(n)]
    smooth = [grade(i, 5, 25) for i in range(n)]
    step = max(1, n // 400)
    idx = range(0, n, step)
    return {
        "km": [round(dist[i] / 1000, 3) for i in idx],
        "alt": [round(pts[i][2], 1) for i in idx],
        "raw": [round(raw[i], 1) for i in idx],
        "smooth": [round(smooth[i], 1) for i in idx],
        "total_km": round(dist[-1] / 1000, 1),
        "max_raw": round(max(raw), 1),
        "max_smooth": round(max(smooth), 1),
    }


def mensal():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = con.execute(
        "SELECT strftime('%Y-%m', created_at), COUNT(*), ROUND(SUM(total_distance)/1000), "
        "ROUND(SUM(duration)/3600.0, 1) FROM activities "
        "WHERE deleted_at IS NULL AND duration >= 600 GROUP BY 1 ORDER BY 1").fetchall()
    return {"mes": [r[0] for r in rows], "sessoes": [r[1] for r in rows],
            "km": [r[2] for r in rows], "horas": [r[3] for r in rows]}


def main():
    data = {"girona": girona(), "pmc": pmc(), "leberg": leberg(), "mensal": mensal()}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("// Gerado por scripts/exportar_dados.py — não editar à mão.\n"
                   "window.ARGUS_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
                   encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB; "
          f"Leberg {data['leberg']['total_km']} km, rampa bruta máx {data['leberg']['max_raw']}%, "
          f"suavizada {data['leberg']['max_smooth']}%")


if __name__ == "__main__":
    main()
