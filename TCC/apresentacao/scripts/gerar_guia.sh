#!/usr/bin/env bash
# Gera o guia de estudo: miniaturas dos slides, HTML (pandoc) e PDF (Chromium do Playwright).
# Uso (em TCC/apresentacao):  npm run guia      ou   bash scripts/gerar_guia.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/gerar_miniaturas.mjs
pandoc guia/GUIA-DE-ESTUDO.md -o guia/GUIA-DE-ESTUDO.html --standalone --toc --toc-depth=1 \
  --css guia.css --metadata pagetitle="Guia de estudo · Argus Cyclist"
node scripts/guia_pdf.mjs
