# COMPLEMENTAR.md — Pendências restantes

Este documento lista os itens que **ainda precisam ser preenchidos** no TCC.
Itens já resolvidos (cabeçalho institucional, banca, título "ciclismo
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

---

## Itens já resolvidos (não precisa refazer)

- **Dados descritivos do piloto** (Seção 7.5.1, Tabela de estatística
  descritiva e Figura do PMC real), gerados do banco do perfil em 01/11/2026
  com `scripts/exportar_pmc.py`.
- Equipamentos: ThinkRider X2 MAX, Cycplus H1, bicicleta ergométrica Spinning
  SB 2000; ambientes Arch Linux, Windows 11 e Android.
- Testes funcionais: manuais, cobrindo todas as funcionalidades (sem planilha ou
  relatório formal).

## Decisões registradas

- **Latência, memória e estabilidade NÃO foram medidas com instrumentação.**
  Os valores aproximados anotados anteriormente (~80 ms, ~85 MB) eram
  estimativas informais, sem procedimento reprodutível, e por isso **não**
  entram no texto; o Capítulo 7 declara a ausência de medição.
- "Sessões de até 3 h": não confirmado pelo banco (sessão mais longa
  registrada: 2,0 h). Não usar.
- "Mais de 200 FIT aceitos": o banco registra 47 sessões enviadas ao Strava;
  o texto fala em aceitação "nos testes realizados", sem número.

---

## Checklist antes da versão final

- [ ] Informar data de aprovação após a defesa.
- [ ] Conferir titulação da banca.
- [ ] Revisão de conteúdo opcional (fundamentação, apêndices, versões) — deixada
      para depois pelo autor.
- [ ] Rodar `make` e conferir que `main.pdf` compila sem erros.
