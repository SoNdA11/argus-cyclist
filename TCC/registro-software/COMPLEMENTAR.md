# COMPLEMENTAR.md — Pendências restantes

Este documento lista os itens que **ainda precisam ser preenchidos** no TCC.
Os itens já resolvidos (cabeçalho institucional, banca, título "ciclismo
indoor", ano 2026, conformidade `.fit`, cenários de teste, capturas de tela
mobile/componentes/evento, **latência de telemetria** e **consumo de memória**)
foram aplicados no documento e aqui removidos.

---

## 1. Data de aprovação (alta prioridade)

> Arquivo: `pretextual/folha_aprovacao.tex`

- Após a defesa, preencher "Aprovada em: __/__/____".

## 2. Titulação dos membros da banca (baixa prioridade)

> Arquivo: `pretextual/folha_aprovacao.tex`

- Os membros foram preenchidos com "Prof." genérico. Se houver titulação
  específica (Dr., Me., Esp.), ajustar, ex.:
  - Sebastião Emidio Alves Filho
  - Adalberto Veronese da Costa

---

## Itens já resolvidos (não precisa refazer)

- **Validação experimental preenchida** no capítulo
  `capitulos/06-resultados.tex`:
  - Latência de telemetria: **~80 ms** (alvo < 150 ms, RNF01) — conformidade.
  - Consumo de memória do backend Go: **~85 MB** (alvo < 200 MB, RNF04) — conformidade.
- Equipamentos: ThinkRider X2 MAX, Cyplus H1, sensor de velocidade, bicicleta
  ergométrica Spinning SB 2000 Genis; ambientes Arch Linux, Windows 11 e Android.
- Estabilidade: sessões contínuas de até 3 h sem desconexões BLE.
- Conformidade `.fit`: mais de 200 arquivos exportados ao Strava e Intervals.icu
  sem erros, com métricas conferindo após a importação.
- Testes funcionais: manuais, cobrindo todas as funcionalidades (sem planilha ou
  relatório formal).

---

## Checklist antes da versão final

- [ ] Informar data de aprovação após a defesa.
- [ ] Conferir titulação da banca.
- [ ] Revisão de conteúdo opcional (fundamentação, apêndices, versões) — deixada
      para depois pelo autor.
- [ ] Rodar `make` e conferir que `main.pdf` compila sem erros.
