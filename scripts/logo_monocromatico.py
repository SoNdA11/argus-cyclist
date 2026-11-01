"""Versões monocromáticas do logo da capa, na mesma cor do símbolo do agradecimento.

Usa o canal alfa de img/argus-cyclist-claro.png (gerado por logo_fundo_claro.py)
e pinta todos os pixels com a cor do texto de cada tema. Tamanho e
enquadramento não mudam.

Uso: python3 -I scripts/logo_monocromatico.py
"""
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent.parent
ORIGEM = AQUI / "img" / "argus-cyclist-claro.png"
CORES = {"claro": (14, 31, 61), "escuro": (233, 239, 248)}  # --text de cada tema

alfa = Image.open(ORIGEM).convert("RGBA").getchannel("A")
# a cor única expõe o resíduo semitransparente da extração (halo): descarta-o
alfa = alfa.point(lambda a: 0 if a < 48 else min(255, round((a - 48) * 255 / 160)))
for tema, cor in CORES.items():
    out = Image.new("RGBA", alfa.size, cor + (0,))
    out.putalpha(alfa)
    destino = AQUI / "img" / f"argus-cyclist-mono-{tema}.png"
    out.save(destino, optimize=True)
    print(destino.name, out.size)
