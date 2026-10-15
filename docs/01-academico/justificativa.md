# Justificativa

> **Fonte única de verdade:** a justificativa completa está em
> **[`trabalho-ptcc-2026.md`](./trabalho-ptcc-2026.md)** (seção 3). Este arquivo é
> um resumo navegável.

O projeto **Argus Cyclist** justifica-se em quatro dimensões:

**1. Relevância tecnológica e inovação arquitetural:**
O sistema é um desafio de engenharia — tempo real, concorrência e baixa latência. Go (goroutines)
trata conexões BLE/GATT simultâneas sem bloquear a UI; Wails gera um binário leve (memória < 200 MB,
fração do Electron); Capacitor reaproveita o frontend para Android nativo.

**2. Relevância científica (modelagem física e fisiologia):**
Aplica a **equação de Martin** (arrasto, rolamento, inércia, gradiente) no motor de simulação e
processa localmente métricas consolidadas na literatura: NP, IF, TSS, TRIMP e o gráfico PMC
(CTL/ATL/TSB), além do *aerobic decoupling* (Pw:HR).

**3. Impacto social e inclusão esportiva:**
Solução offline, de código aberto e gratuita para computadores modestos e celulares Android —
democratiza o treinamento de alto rendimento sem assinaturas em dólar.

**4. Soberania tecnológica e padronização:**
Implementa padrões globais de ponta a ponta — decodificação FTMS, formato binário `.FIT` (Garmin)
e integração OAuth 2.0 com APIs externas (Strava) — reduzindo a dependência de caixas-pretas
proprietárias.

**5. Relevância acadêmica (escopo do TCC):**
Transcende um simples sistema de informação, exigindo comunicação de rede de baixo nível,
engenharia modular, matemática aplicada e UX — resultando num artefato elegível ao registro
de software junto ao INPI.
