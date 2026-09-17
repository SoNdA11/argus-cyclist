# Registro de Software — Argus Cyclist (TCC)

Este diretório contém o projeto LaTeX do documento de **Registro de Software**
do Argus Cyclist, a ser apresentado como Trabalho de Conclusão de Curso (TCC)
do Curso de Bacharelado em Ciência da Computação da UERN.

## Estrutura

```
registro-software/
├── Makefile                     # compilação (make)
├── main.tex                     # documento principal (inclui todos os arquivos)
├── README.md                    # este arquivo
├── COMPLEMENTAR.md              # lista de informações a serem preenchidas
├── config/                      # configurações do documento
│   ├── preambulo.tex            # pacotes, cores, hiperlinks
│   ├── comandos.tex             # comandos personalizados (caixa [COMPLEMENTAR])
│   └── informacoes.tex          # TÍTULO, AUTOR, ORIENTADOR, INSTITUIÇÃO...
├── pretextual/                  # capa, folhas, resumo, listas, sumário
│   ├── capa.tex
│   ├── folha_rosto.tex
│   ├── folha_aprovacao.tex
│   ├── registro_inpi.tex        # página com o certificado do INPI
│   ├── resumo.tex
│   ├── abstract.tex
│   ├── listas.tex
│   └── sumario.tex
├── capitulos/                   # capítulos textuais
│   ├── 01-introducao.tex
│   ├── 02-fundamentacao.tex
│   ├── 03-registro-evolucao.tex
│   ├── 04-arquitetura.tex
│   ├── 05-implementacao.tex
│   ├── 06-resultados.tex
│   └── 07-conclusao.tex
├── postextual/
│   ├── referencias.bib          # bibliografia (BibTeX)
│   └── apendices/
│       ├── apendice-a-instalacao.tex
│       └── apendice-b-ambiente.tex
├── figuras/                     # diagramas TikZ e capturas de tela
└── certificado/                 # certificado oficial do INPI (PDF)
```

## Como compilar

Pré-requisito: TeX Live com `abntex2` (no Arch Linux: pacote
`texlive-publishers`) e `latexmk` (pacote `texlive-binextra`).

```bash
make            # compila main.pdf
make clean      # remove arquivos temporários
```

Ou manualmente:

```bash
pdflatex -interaction=nonstopmode main.tex
bibtex main
pdflatex -interaction=nonstopmode main.tex
pdflatex -interaction=nonstopmode main.tex
```

O PDF gerado é `main.pdf`.

## Orientações

1. **Antes de entregar**, edite `config/informacoes.tex` e confirme os dados
   institucionais (ver item 1 do `COMPLEMENTAR.md`).
2. Os trechos **em vermelho com a marca `[COMPLEMENTAR]`** no PDF são
   indicações de conteúdo que ainda precisa ser escrito/preenchido. Para a
   versão final, preencha-os (ou remova as chamadas a `\complementar{}`).
3. A capa, folha de rosto e folha de aprovação seguem o modelo oficial
   "Template TCC - Registro de Software.md" disponibilizado pela
   coordenação. Ajuste conforme as orientações da banca.
