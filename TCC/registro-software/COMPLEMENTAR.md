# COMPLEMENTAR.md — Pendências restantes

Este documento lista os itens que **ainda precisam ser preenchidos** no TCC.
Os itens já resolvidos (cabeçalho institucional, banca, título "ciclismo
indoor", ano 2026, conformidade `.fit`, cenários de teste, capturas de tela
mobile/componentes/evento) foram aplicados no documento e aqui removidos.

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

## 3. Validação experimental — valores não mensurados (alta prioridade)

> Arquivos: `capitulos/06-resultados.tex` (Tabela "Resultados da validação
> experimental", campos marcados `[COMPLEMENTAR]`)

- **Latência de telemetria** (alvo: < 150 ms, RNF01): não foi medida. Sugere-se
  medir o tempo entre a recepção do pacote BLE e a atualização na tela.
- **Consumo de memória do backend Go** (alvo: < 200 MB, RNF04): não foi medido.
  Sugere-se aferir com ferramenta de monitoramento durante uma sessão ativa.

O que **já foi preenchido** (não precisa refazer):
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
- [ ] Medir latência de telemetria e consumo de memória (ou remover as caixas
      `[COMPLEMENTAR]` e a menção aos requisitos pendentes).
- [ ] Revisão de conteúdo opcional (fundamentação, apêndices, versões) — deixada
      para depois pelo autor.
- [ ] Rodar `make` e conferir que `main.pdf` compila sem erros.
