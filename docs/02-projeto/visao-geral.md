# Visão Geral do Produto

O **Argus Cyclist** é uma plataforma de telemetria e simulação para ciclismo indoor de alto desempenho, concebida como um ecossistema modular e agnóstico a hardware. Diferente de soluções baseadas estritamente em gamificação, o Argus foca na precisão analítica e na otimização da experiência do atleta através de uma interface de baixa latência e alta fidelidade de dados.

## Proposta de Valor

O sistema atua como uma ponte inteligente entre o hardware esportivo (sensores de potência, frequência cardíaca e rolos de treino inteligentes) e as plataformas de análise global. Sua arquitetura híbrida (Go + Wails) garante que o software seja leve o suficiente para rodar em computadores de entrada, enquanto mantém o rigor necessário para o registro oficial de treinamentos profissionais.

## Objetivos Estratégicos

* **Interoperabilidade Total:** Suporte nativo aos protocolos padrão da indústria (BLE/FTMS/FE-C), garantindo que o atleta não fique preso a ecossistemas proprietários.
* **Performance Computacional:** Utilização de processamento nativo em Go para manipulação de sinais de sensores, eliminando gargalos comuns em aplicações baseadas puramente em Electron ou Web.
* **Engajamento e Gamificação:** Inclusão de segmentos de desafio (Sprints e KOM - King of the Mountain) e testes de aptidão (FTP Assessment) para tornar a experiência imersiva e dinâmica.
* **Sincronização Unificada e Persistência Local:** Armazenamento local robusto em SQLite garantindo funcionamento *offline* e modo *Dashboard* de estúdio, além da integração fluida com o Strava para o ciclo de treino completo.
* **Simulação Física Realista:** Implementação de um motor de física que traduz gradientes de arquivos GPX em resistência real no equipamento, simulando a sensação de rodagem externa de maneira eficiente.
