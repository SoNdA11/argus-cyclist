# Apresentação da defesa — Argus Cyclist

Deck em Reveal.js 5.1.0, **100% offline**. Todas as bibliotecas, fontes e
imagens estão em `vendor/` e `img/`, e os dados reais estão em `data/dados.js`.
Não há CDN nem chamada de rede.

## Apresentar

Abra `index.html` no Chrome ou no Chromium. Funciona direto por `file://`, sem
servidor.

| Tecla | Ação |
|---|---|
| → / espaço | próximo clique (fragmento) ou slide |
| ← | voltar |
| `S` | visão do apresentador: notas, cronômetro e próximo slide |
| `F` | tela cheia |
| `Esc` | visão geral dos slides |
| `B` ou `.` | tela preta |
| `T` | alterna tema claro (padrão) / escuro — a escolha fica salva no navegador |

As notas de cada slide trazem a fala-chave. Cada slide também tem um tempo-alvo
(`data-timing`), que soma **18 min** e deixa 2 min de folga. Na visão
do apresentador (`S`), o cronômetro de *pacing* mostra se você está adiantado ou
atrasado em relação a esse plano: é o apoio para os ensaios cronometrados.

Tema: claro por padrão. Se o projetor da sala lavar as cores, use `T` (ou abra
`index.html?tema=escuro`).

## Contingência

1. **PDF:** `npm install && npm run pdf` gera `argus-cyclist-defesa.pdf`, com
   uma página por clique, idêntico ao que é projetado. Se o Chromium do
   Playwright não estiver instalado, indique outro com `CHROME=/caminho/do/chrome`.
   Alternativa manual: abrir `index.html?print-pdf` no Chrome e imprimir em PDF
   (margens: nenhuma; gráficos de fundo: ativado).
2. **Pendrive:** copiar a pasta inteira, exceto `node_modules/`; ela abre em
   qualquer Chrome.

## Atualizar os dados

```bash
npm run dados   # equivale a: python3 -I scripts/exportar_dados.py
```

Logo da capa: `img/argus-cyclist-mono-{claro,escuro}.png` (mesma cor do símbolo do
agradecimento) sai de `scripts/logo_monocromatico.py`, a partir de
`img/argus-cyclist-claro.png`, que por sua vez é gerado do logo original
(fundo navy) por `scripts/logo_fundo_claro.py` — extrai a transparência por
color-to-alpha e ajusta a intensidade para fundo claro.

O script de dados lê, somente para leitura:
- a sessão de Girona (`../registro-software/figuras/girona-sessao.csv`);
- o PMC (`../registro-software/figuras/pmc-dados.csv`);
- o GPX de Geraardsbergen–Leberg;
- o banco do perfil.


## Estrutura

```
index.html        slides e notas do apresentador
css/argus.css     tema (cores das grandezas fixas: potência amarela, FC vermelha…)
js/charts.js      gráficos ECharts; a física do slide 10 usa as constantes do motor Go
js/deck.js        inicialização do Reveal, rodapé, gatilhos dos gráficos
data/dados.js     gerado por scripts/exportar_dados.py
vendor/           reveal.js 5.1.0, ECharts 6.0.0, fontes Inter e JetBrains Mono (licenças incluídas)
```
