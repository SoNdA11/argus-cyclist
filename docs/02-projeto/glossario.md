# Glossário de Termos Técnicos

* **ANT+ / FE-C:** Protocolos de comunicação sem fio específicos para fitness (Fitness Equipment Control).
* **ATL (*Acute Training Load*):** Carga de treino aguda (fadiga), componente do gráfico PMC calculada numa janela de ~7 dias.
* **BLE (Bluetooth Low Energy):** Tecnologia de rede sem fio de baixo consumo utilizada para comunicação com sensores esportivos.
* **Bootstrap:** Janela de tempo imediatamente após o esforço, usada para medir a recuperação da frequência cardíaca (HRR1/HRR2).
* **Cadência:** Velocidade de pedalada, medida em rotações por minuto (RPM).
* **CdA:** Produto do coeficiente de arrasto aerodinâmico (Cd) pela área frontal (A) — chave da resistência do ar na equação de Martin.
* **CTL (*Chronic Training Load*):** Carga de treino crônica ("fitness"), média da carga dos ~últimos 42 dias, componente do PMC.
* **Edge Computing:** Paradigma de processamento dos dados na própria extremidade (dispositivo do usuário) em vez de em servidores remotos.
* **ERG:** Modo de treino em que o rolo mantém a potência-alvo fixa, independente da cadência do ciclista.
* **FIT File:** Formato binário interoperável criado pela Garmin, padrão para armazenamento de dados de GPS e telemetria cardíaca/potência.
* **FTP (*Functional Threshold Power*):** Potência máxima média sustentável por ~1 hora — base para calibrar zonas de treino.
* **FTMS (Fitness Machine Service):** Protocolo padrão Bluetooth que permite que softwares controlem a resistência de equipamentos de academia e rolos de treino.
* **GATT (Generic Attribute Profile):** Modo de comunicação do Bluetooth que define como os dados (serviços e características) são expostos por um sensor.
* **GPX (GPS Exchange Format):** Formato XML para troca de dados de GPS (rotas, trilhas e pontos).
* **HRR (*Heart Rate Recovery*):** Velocidade de queda da frequência cardíaca após o fim do esforço (medida em 1 e 2 minutos).
* **IF (*Intensity Factor*):** Razão entre a Potência Normalizada e o FTP — intensidade relativa de uma sessão.
* **KOM (*King of the Mountain*):** Reconhecimento para o melhor tempo em uma subida (segmento); em software local, disputado contra si mesmo ou na rede local.
* **NP (*Normalized Power*):** Potência estimada considerando o custo metabólico de esforços variáveis — mais representativa que a média simples.
* **OAuth 2.0:** Protocolo de autorização que concede acesso delegado a uma API (ex.: Strava) sem expor a senha do usuário.
* **Offline-first:** Estratégia de projeto em que o sistema funciona plenamente sem conexão, tratando a rede como opcional.
* **Ollama:** Ferramenta de inferência de LLMs locais usada pelo assistente de treino do Argus.
* **PMC (*Performance Management Chart*):** Gráfico de evolução de treino que acompanha CTL, ATL e TSB ao longo do tempo.
* **Pw:HR (*Aerobic Decoupling*):** Desacoplamento entre potência e frequência cardíaca em ritmo constante; > 5% indica fadiga ou desidratação.
* **Smart Trainer:** Rolo de treino capaz de variar a resistência e se comunicar bidirecionalmente com software (FTMS/FE-C).
* **Strava / Intervals.icu:** Plataformas externas de análise e socialização de atividades, para as quais o Argus exporta arquivos `.fit`.
* **TSB (*Training Stress Balance*):** Balanço de estresse ("forma"), diferença entre CTL e ATL — positivo indica recuperação.
* **TSS (*Training Stress Score*):** Pontuação de carga de uma sessão combinando duração e intensidade relativa ao FTP.
* **TRIMP:** Estimativa de carga de treino baseada no esforço cardíaco em relação à frequência cardíaca de repouso e máxima.
* **Wails:** Framework de código aberto que permite construir aplicações desktop multiplataforma usando Go e tecnologias web modernas (Vite, Vue, React).
* **Watts (W):** Unidade de medida de potência que representa o esforço real exercido pelo ciclista nos pedais.
* **ZWO:** Formato XML de planos de treino estruturado (usado pelo Zwift), suportado na importação/exportação do Argus.
