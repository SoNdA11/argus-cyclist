# =====================================================================
#  Makefile — compilação do TCC (Registro de Software — Argus Cyclist)
#  Uso:
#    make          compila o documento (main.pdf)
#    make clean    remove os arquivos temporários
# =====================================================================

TEX      = pdflatex -interaction=nonstopmode -halt-on-error
BIB      = bibtex
MAIN     = main
LATEXMK  = latexmk

all: build

# Compilação com latexmk (recomendado, gerencia bibtex automaticamente)
build:
	$(LATEXMK) -pdf -interaction=nonstopmode $(MAIN).tex

# Compilação manual (sem latexmk)
build-manual:
	$(TEX) $(MAIN).tex
	$(BIB) $(MAIN) || true
	$(TEX) $(MAIN).tex
	$(TEX) $(MAIN).tex

clean:
	rm -f $(MAIN).aux $(MAIN).bbl $(MAIN).blg $(MAIN).log \
	      $(MAIN).out $(MAIN).toc $(MAIN).lof $(MAIN).lot \
	      $(MAIN).fls $(MAIN).fdb_latexmk $(MAIN).synctex.gz

distclean: clean
	rm -f $(MAIN).pdf

.PHONY: all build build-manual clean distclean
