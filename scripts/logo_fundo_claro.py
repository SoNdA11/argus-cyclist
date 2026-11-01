#!/usr/bin/env python3
"""Gera a versão do logo do Argus para fundo claro a partir do original (fundo navy).

Causa do aspecto desbotado: o logo foi desenhado para fundo navy; recortado com
tolerância, perdia o antisserrilhado (borda escura) e o ciano ficava com pouco
contraste sobre branco, sobretudo nos traços finos do símbolo.

Correção:
  1. color-to-alpha (com o corpo do traço normalizado para opaco): separa cada pixel em cor do traço + transparência,
     "desmisturando" o navy (bordas suaves, sem halo escuro);
  2. ajusta intensidade para fundo claro (mesmo matiz e degradê: valor -20%,
     saturação +12%), igual para símbolo e lettering;
  3. engrossa em 1 px apenas os traços do símbolo (região acima do lettering).

Uso (em TCC/apresentacao):
  python3 -I scripts/logo_fundo_claro.py ../../frontend/assets/icon.png img/argus-cyclist-claro.png
"""
import colorsys
import sys

import numpy as np
from PIL import Image, ImageFilter

BG = np.array([9, 26, 52], dtype=float)  # navy do fundo original
LETTERING_START = 0.80                   # fração da altura onde começa "ARGUS"


def color_to_alpha(rgb):
    p = rgb.astype(float)
    # os traços são sempre mais claros que o navy; pixels mais escuros que o
    # fundo são ruído de compressão (o canal R do fundo vale só 9)
    up = np.where(p > BG, (p - BG) / (255.0 - BG), 0.0)
    alpha = np.max(up, axis=2)
    alpha = np.where(alpha < 0.12, 0.0, alpha)
    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    fg = np.clip((p - BG) / safe + BG, 0, 255)
    # o miolo dos traços sai com ~85% de alfa (o ciano não é "puro"); se ficar
    # assim, o fundo claro atravessa e o símbolo desbota. Normaliza para que o
    # corpo do traço seja opaco e só as bordas mantenham o antisserrilhado.
    # normalização separada para símbolo e lettering, que têm intensidades
    # ligeiramente diferentes no original
    rows = np.nonzero(alpha.max(axis=1) > 0)[0]
    split = int(rows.min() + (rows.max() - rows.min()) * LETTERING_START)
    for sl in (slice(0, split), slice(split, None)):
        part = alpha[sl]
        core = np.percentile(part[part > 0.5], 60)
        alpha[sl] = np.clip(part / core, 0.0, 1.0)
    return fg, alpha


def adjust(fg, alpha):
    out = fg.copy()
    flat = out.reshape(-1, 3)
    mask = alpha.reshape(-1) > 0
    for i in np.nonzero(mask)[0]:
        r, g, b = flat[i] / 255.0
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        flat[i] = np.array(colorsys.hsv_to_rgb(h, min(1.0, s * 1.12), v * 0.80)) * 255
    return out


def main(src, dst):
    im = Image.open(src).convert("RGB")
    fg, alpha = color_to_alpha(np.asarray(im))
    fg = adjust(fg, alpha)

    rgba = np.dstack([fg, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")

    # engrossa 1 px só no símbolo
    cut = 0
    ys = np.nonzero(np.asarray(img.getchannel("A")).max(axis=1) > 0)[0]
    top, bottom = ys.min(), ys.max()
    split = int(top + (bottom - top) * LETTERING_START)
    sym = img.crop((0, cut, img.width, split))
    a = sym.getchannel("A").filter(ImageFilter.MaxFilter(3))
    rgb = sym.convert("RGB").filter(ImageFilter.MaxFilter(3))
    thick = Image.merge("RGBA", (*rgb.split(), a))
    img.paste(thick, (0, cut))

    img = img.crop(img.getbbox())
    img.save(dst, optimize=True)
    print(dst, img.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
