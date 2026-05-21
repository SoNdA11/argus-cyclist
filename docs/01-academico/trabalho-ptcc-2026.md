# ARGUS CYCLIST: UM ECOSSISTEMA MULTIPLATAFORMA E DE CÓDIGO ABERTO PARA O CICLISMO INDOOR

## 1. INTRODUÇÃO E A SITUAÇÃO ATUAL DO CICLISMO VIRTUAL

O ciclismo virtual (*indoor cycling*) transitou de uma simples atividade alternativa para dias chuvosos para uma modalidade esportiva e científica de alta relevância global. Atualmente, é reconhecida pela União Ciclística Internacional (UCI) como uma modalidade oficial de *e-sports*, contando com campeonatos mundiais e atletas profissionais dedicados. Este fenômeno foi impulsionado pelo surgimento de rolos de treino inteligentes (*smart trainers*), capazes de estabelecer comunicação bidirecional com computadores e dispositivos móveis para simular a resistência do terreno real em tempo real.

No entanto, a situação atual do ciclismo virtual é marcada por uma forte centralização de mercado e barreiras econômicas severas. Plataformas líderes como Zwift, Rouvy e TrainerRoad operam sob modelos de assinatura mensal proprietários com taxas cobradas em dólar comercial, entre $15 e $20 USD/mês. Para atletas em países em desenvolvimento, como o Brasil, o custo acumulado dessas assinaturas ultrapassa facilmente R$ 1.200,00 anuais, o que constitui um fator de exclusão para ciclistas amadores e atletas de base.

Além da barreira financeira, essas plataformas comerciais exigem hardware de alto desempenho com placas gráficas dedicadas (computadores *gamer*), inviabilizando o uso por atletas que possuem apenas computadores de entrada ou dispositivos móveis comuns. Adicionalmente, tais soluções dependem de conexão contínua com a internet para computar métricas, o que impede treinos em ambientes offline ou com conectividade instável.

Nesse cenário, surge o projeto Argus Cyclist. Ele se propõe a ser uma alternativa nacional, multiplataforma,
offline-first e de código aberto, unindo simulação física interativa e telemetria de precisão sem taxas recorrentes
e com baixíssimos requisitos de hardware.

### 1.1 Referências a Outros Projetos e Estado da Arte

Para contextualizar a relevância e posicionamento do **Argus Cyclist**, apresenta-se a seguir um comparativo com as principais plataformas do mercado e iniciativas de código aberto:

* **Zwift:** O líder absoluto do mercado foca em um ambiente virtual tridimensional massivo online, com forte apelo social e gamificação. Suas limitações residem na ausência de modo offline, custo recorrente elevado e exigência de hardware potente para processamento gráfico 3D.
* **Rouvy:** Diferencia-se por simular rotas reais por meio de vídeos gravados de estradas ao redor do mundo. Apresenta alta demanda de largura de banda de rede para transmissão de vídeo e sofre dos mesmos problemas de custo de assinatura fechada.
* **TrainerRoad:** Foca exclusivamente em treinos estruturados baseados em faixas de potência (telemetria pura), sem simulação gráfica complexa. Suas métricas e planos de treino são proprietários e bloqueados por assinaturas de custo elevado.
* **GoldenCheetah (Código Aberto):** Software livre sob licença GPLv3 voltado à análise científica pós-treino. Embora possua ferramentas matemáticas excelentes (como o gráfico PMC e modelos de fadiga), sua interface é extremamente complexa, com uma curva de aprendizado íngreme, e ele não foi projetado para atuar como um simulador de rotas interativo e responsivo em tempo real com controle de rolos inteligentes.

O **Argus Cyclist** posiciona-se no estado da arte ao preencher a lacuna entre a análise de dados científica (típica do GoldenCheetah) e a simulação de rotas interativa e gamificada (típica do Zwift), operando de forma totalmente gratuita, multiplataforma, offline-first e com processamento local eficiente.

| Plataforma | Tipo de Licença | Modelo de Processamento | Requisitos de Hardware | Conectividade Offline | Foco Principal |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Zwift** | Proprietária ($20/mês) | Nuvem (Cloud-centric) | Alto (GPU Dedicada) | Não (Requer Net) | Gamificação e Social |
| **Rouvy** | Proprietária ($15/mês) | Nuvem / Stream | Médio-Alto | Não (Requer Net) | Realismo de Rotas (Vídeo) |
| **TrainerRoad** | Proprietária ($20/mês) | Nuvem (Cloud-centric) | Baixo | Não (Requer Net) | Treinos Estruturados |
| **GoldenCheetah** | Código Aberto (GPLv3) | Local (Offline) | Baixo | Sim (Completo) | Análise Post-Ride Avançada |
| **Argus Cyclist** | Código Aberto (GPLv3) | Local (Edge Computing) | Baixo (Multiplataforma)| Sim (Offline-first) | Simulação Física e Telemetria |

---

## 2. PROBLEMÁTICA

O desenvolvimento do projeto Argus Cyclist é motivado por quatro problemas centrais identificados no ecossistema atual do ciclismo virtual:

1. **Exclusão Socioeconômica e Barreiras de Acesso:** O modelo de monetização em moeda estrangeira das plataformas de e-sports de ciclismo inviabiliza o treinamento científico e estruturado para atletas de base e ciclistas amadores de menor poder aquisitivo no Brasil.
2. **Dependência Crônica de Conectividade (Cloud Lock-in):** A arquitetura das soluções comerciais centraliza a lógica do simulador e o processamento de métricas em servidores na nuvem. Quedas temporárias de conexão resultam no encerramento abrupto das atividades ou na perda de treinos inteiros, além de inviabilizar o uso em locais sem sinal de internet.
3. **Vulnerabilidade de Privacidade de Dados:** A coleta de dados biométricos (frequência cardíaca contínua) e geográficos (coordenadas GPS de rotas importadas) é armazenada de forma compulsória em servidores privados estrangeiros, infringindo princípios de soberania de dados e privacidade por padrão (*Privacy-by-Design*).
4. **Monetização Fisiológica Abusiva:** Métricas avançadas de controle de carga de treino — fundamentais para evitar o *overtraining* e prescrever a recuperação (como PMC, TSS e CTL) — dependem apenas de equações matemáticas consolidadas na literatura científica de fisiologia do esporte. Ainda assim, são vendidas como recursos exclusivos em softwares proprietários pagos.

---

## 3. JUSTIFICATIVA

O projeto **Argus Cyclist** justifica-se pela sua contribuição tecnológica, científica e de impacto social no cenário esportivo e de engenharia de software:

### 3.1 Relevância Tecnológica e Inovação Arquitetural

Do ponto de vista da Engenharia de Software, o projeto aborda o desafio de criar um sistema multiplataforma de tempo real de baixíssima latência. A escolha do **Go (Golang)** no backend deve-se à sua capacidade nativa de concorrência baseada em *Goroutines* e *Channels*, permitindo realizar escaneamento e manter conexões estáveis com múltiplos sensores Bluetooth Low Energy (BLE) usando perfis GATT específicos (frequência cardíaca, potência e controle bidirecional FTMS) sem congelar a interface de usuário.

A integração com o framework **Wails** viabiliza um binário de desktop extremamente leve, utilizando a *web engine* nativa do sistema operacional para renderizar uma interface reativa em **JavaScript (Vite)**, registrando um consumo de memória inferior a 200MB (uma fração do demandado por soluções baseadas em Electron). Para dispositivos móveis, a utilização do **Capacitor.js** possibilita reutilizar a mesma base de código do frontend para compilar um aplicativo nativo para Android, rodando um motor físico portado inteiramente para JavaScript para simular e controlar os rolos diretamente de um celular comum via antenas BLE integradas.

### 3.2 Relevância Científica (Modelagem Física e Fisiologia)

O sistema aplica modelagens matemáticas rigorosas de física e fisiologia do esporte diretamente no dispositivo do usuário:

* **Dinâmica de Movimento (Equação de Martin):** O motor físico calcula a aceleração e a velocidade virtual
aplicando a conservação de energia sobre as forças
resistivas: arrasto aerodinâmico (baseado no coeficiente
CdA de área frontal), resistência ao rolamento dos pneus
(Crr), perdas na transmissão mecânica da bicicleta, efeito
de inércia da massa conjunta (ciclista + bicicleta) e a
resistência gravitacional exercida por gradientes de
inclinação do relevo em tempo real.
* **Carga de Treinamento e Fisiologia:** Processa o vetor de potência de 1Hz para extrair a Potência Normalizada (NP) — que reflete o custo metabólico real do esforço —, o Fator de Intensidade (IF) e o Training Stress Score (TSS). A aplicação calcula e renderiza o Performance Management Chart (PMC) compilando a Carga de Treino Crônica (CTL - Fitness), Carga de Treino Aguda (ATL - Fadiga) e o Balanço de Estresse (TSB - Forma). Adicionalmente, computa o Desvio Cardiovascular (Aerobic Decoupling - Pw:HR) comparando o trabalho mecânico à frequência cardíaca em treinos de ritmo constante para alertar o atleta sobre desidratação ou fadiga cardíaca excessiva (> 5%)

### 3.3 Relevância Social e Inclusão Esportiva

Ao prover uma solução offline de código aberto e totalmente gratuita compatível com computadores modestos e celulares Android, o Argus Cyclist atua como um elemento de inclusão social. O projeto permite que ciclistas locais e equipes amadoras de ciclismo utilizem equipamentos de rolo de treino inteligente sem taxas mensais, democratizando o treinamento esportivo de alto rendimento.

---

## 4. OBJETIVOS

### 4.1 Objetivo Geral

Projetar, desenvolver e validar o **Argus Cyclist**, um simulador multiplataforma de ciclismo virtual de código aberto e gratuito, integrado a um sistema científico de análise de telemetria esportiva offline-first, garantindo processamento em borda (*Edge*) de baixa latência e interoperabilidade com hardware padrão do mercado.

### 4.2 Objetivos Específicos

1. **Conectividade de Hardware:** Implementar rotinas robustas em Go para escaneamento e conexão com periféricos via Bluetooth Low Energy (BLE), decodificando serviços GATT para cintas cardíacas (`0x180D`), sensores de potência (`0x1818`) e rolos de treino controlados (`FTMS - 0x1826`).
2. **Motor de Simulação Física:** Desenvolver algoritmos que traduzam o gradiente das coordenadas de uma rota GPX em resistência de torque mecânico no rolo de treino inteligente, atualizando dinamicamente a resistência conforme o peso do ciclista e sua inclinação virtual.
3. **Interface Gráfica de Alta Performance:** Construir um HUD (Heads-Up Display) leve de 60fps usando Canvas/WebGL, integrando o MapLibre GL JS com renderização topográfica em 3D Terrain-RGB e rotas dinâmicas coloridas de acordo com a inclinação do terreno.
4. **Análise Fisiológica Local:** Implementar funções matemáticas para cálculo contínuo de métricas esportivas avançadas (NP, IF, TSS, TRIMP) e visualização do gráfico de evolução histórica de carreira PMC (Performance Management Chart).
5. **Persistência de Dados Confiável:** Modelar um banco de dados local com SQLite usando o padrão *Repository* e *Facade* para persistir usuários, atividades e recordes pessoais de forma 100% offline e estruturada.
6. **Interoperabilidade de Dados:** Desenvolver rotinas para compilação e exportação de dados na estrutura de arquivo binário padrão `.FIT` (Garmin/ANT+ SDK) e integração de upload assíncrono via API do Strava.
7. **Portabilidade Multiplataforma:** Compilar a aplicação para sistemas Android, Windows, macOS e Linux utilizando tecnologias multiplataforma, adaptando o motor físico para JavaScript a fim de garantir operação autônoma, compatibilidade entre diferentes ambientes e baixa latência em dispositivos móveis e desktops.
8. **Gamificação Saudável:** Integrar um sistema de níveis e conquistas cardiovasculares persistentes com uma Trophy Room interativa 3D/Canvas para engajamento dos atletas amadores.

---

## 5. METODOLOGIA

O trabalho adota uma metodologia de **pesquisa aplicada**, orientada ao desenvolvimento tecnológico experimental, utilizando abordagens qualitativas e quantitativas para validação dos resultados. O processo de engenharia de software baseia-se em um modelo de **desenvolvimento iterativo e incremental** (práticas ágeis), dividido em quatro fases essenciais:

### 5.1 Fases do Desenvolvimento

1. **Fase de Levantamento e Especificação:**
    * Estudo aprofundado dos perfis GATT Bluetooth SIG (Heart Rate Service, Cycling Power Service e Fitness Machine Service) e decodificação hexadecimal de frames de telemetria. Análise da documentação do Garmin FIT SDK para modelar o codificador de arquivos binários e das APIs REST do Strava sob protocolo de segurança OAuth 2.0.
2. **Fase de Definição Arquitetural:**
    * Desenho do padrão estrutural do sistema sob conceitos de Clean Architecture. Separação rígida de responsabilidades em camadas (Apresentação, Casos de Uso, Serviços de Domínio e Persistência de Dados). Seleção da stack multiplataforma ideal: backend em Go (Golang) com bindings Wails (Desktop) e empacotamento móvel nativo em Android via Capacitor.js
3. **Fase de Implementação e Refatoração:**
    * Implementação dos serviços em Go: módulo de telemetria ('internal/service/ble') com goroutines concorrentes de escuta; módulo físico ('internal/service/sim') com suporte a GPX e testes de FTP; persistência em banco local ('internal/repository/sqlite') sob padrão Facade ('usecase/storage_facade'); e exportador esportivo ('internal/service/fit'). No frontend JS, implementa-se o TelemetryEventBus para desacoplar a atualização de tela da chegada de dados BLE, garantindo renderização fluida a 60fps.
4. **Fase de Testes e Validação Experimental:**
    * Execução de testes funcionais e de integração utilizando equipamentos reais de ciclismo próprios, conectando o Argus Cyclist a rolos inteligentes (smart trainers) e medidores de potência para validação prática do sistema em ambiente de uso real. A validação quantitativa consiste na medição da latência de telemetria (requisitada para operar em < 150ms do hardware até a tela) e em testes de conformidade estrutural, submetendo os arquivos binários “.fit” gerados diretamente ao Strava, atestando a integridade estatística dos dados em relação ao padrão global da indústria.

---

## 6. ARQUITETURA E DIAGRAMAS

A arquitetura do **Argus Cyclist** foi desenhada para garantir o máximo isolamento da lógica de negócio em relação ao hardware e às interfaces visuais, assegurando que o simulador funcione com alto desempenho tanto no computador quanto no celular.

### 6.1 Topologia de Componentes

A divisão lógica do sistema estrutura-se nas seguintes camadas principais:

1. **Camada de Apresentação (Frontend Vanilla JS):** Gerencia a interface de usuário, gráficos Canvas e o barramento de eventos `TelemetryEventBus` que atualiza a tela de forma assíncrona.
2. **Wails IPC Bridge (Desktop):** Camada de comunicação interprocesso que conecta a lógica do frontend (JS) ao núcleo do backend (Go).
3. **Camada de Aplicação (Controladores/Casos de Uso Go):** Estrutura a fachada `Storage Facade` e os controladores de treinos (`Workout Controller`) e desafios (`Challenge Controller`).
4. **Camada de Domínio / Serviços Core (Go):** Compreende o motor físico de simulação baseada em dados GPX e o gerenciador de conexões Bluetooth LE (GATT Subscriptions).
5. **Camada de Persistência (SQLite / FIT / Strava):** Mapeia os repositórios para o banco SQLite local e coordena a geração do arquivo `.FIT` e a transmissão segura à API do Strava.

---

## 7. REFERÊNCIAS BIBLIOGRÁFICAS

1. BLUETOOTH SIG. **Fitness Machine Service (FTMS) Specification v1.0**. Bluetooth Special Interest Group, 2017. Disponível em: <https://www.bluetooth.com/specifications/specs/>.
2. GARMIN. **FIT SDK (Flexible and Interoperable Data Transfer)**. ANT+ Alliance, Garmin Canada, 2024. Disponível em: <https://developer.garmin.com/fit/overview/>.
3. MARTIN, J. C. et al. **Validation of a Mathematical Model for Road Cycling Power**. Journal of Applied Biomechanics, Human Kinetics, v. 14, n. 3, p. 276-291, 1998.
4. COGGAN, A. **Training and Racing with a Power Meter**. 2. ed. Boulder, CO: VeloPress, 2010.
5. STRAVA API. **Strava Developers API Reference v3**. Strava Inc., 2025. Disponível em: <https://developers.strava.com/>.
6. MAPLIBRE. **MapLibre GL JS Documentation v4**. MapLibre Community, 2024. Disponível em: <https://maplibre.org/>.
7. WAILS. **Wails: Create Beautiful Desktop Applications using Go and HTML/CSS/JS v2**. Wails Project, 2024. Disponível em: <https://wails.io/>.
8. CAPACITOR. **Capacitor: Cross-platform Native Runtime for Web Apps v5**. Ionic Project, 2024. Disponível em: <https://capacitorjs.com/>.
