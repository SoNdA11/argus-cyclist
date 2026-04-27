# Metodologia

Para atingir os objetivos propostos de forma estruturada e científica, este trabalho adota uma **pesquisa de natureza aplicada**, com abordagem quali-quantitativa, focada no desenvolvimento tecnológico e experimental. O ciclo de vida do projeto baseia-se em um modelo de **desenvolvimento iterativo e incremental**, inspirado nas práticas das metodologias ágeis de Engenharia de Software.

As etapas metodológicas adotadas dividem-se em quatro fases principais:

## 1. Levantamento e Especificação

A primeira fase constituiu na análise de mercado das plataformas de *cycling e-sports* (Zwift, Rouvy, Mywhoosh) para identificar as lacunas de performance e acessibilidade. A partir disso, foram mapeados os protocolos de comunicação essenciais:

* **Especificação BLE:** Mapeamento dos UUIDs padrão para *Heart Rate* (0x180D), *Cycling Power* (0x1818) e *Fitness Machine* (0x1826).
* **Estrutura de Dados:** Estudo do protocolo `.FIT` da Garmin para armazenamento de sessões.
* **API de Terceiros:** Documentação do fluxo OAuth 2.0 e endpoints RESTful do Strava.

## 2. Definição Arquitetural

A arquitetura do Argus Cyclist foi projetada visando máxima modularidade e separação de responsabilidades (*Clean Architecture*). Foram selecionadas as seguintes tecnologias:

* **Backend (Core System):** Desenvolvido em **Go**, responsável pelo processamento assíncrono, interface com o subsistema Bluetooth do Sistema Operacional, motor de simulação (parse de arquivos GPX) e serialização de dados binários.
* **Bridge Multiplataforma:** O framework **Wails** foi adotado para encapsular a aplicação em um binário executável para Desktop, provendo um canal de comunicação IPC (Inter-Process Communication) rápido entre o Go e a interface gráfica.
* **Frontend:** Implementado com **JavaScript/Vite**, garantindo uma interface rica, responsiva e leve, adaptável a diferentes resoluções.
* **Mobile:** Utilização do **Capacitor** para injetar a interface web nativamente em dispositivos móveis, reutilizando a base de código do frontend.

## 3. Implementação e Codificação

O desenvolvimento foi segmentado em módulos autônomos:

1. **Módulo de Hardware (`internal/service/ble`):** Implementação de clientes genéricos e *mocks* para varredura e conexão com sensores GATT.
2. **Módulo de Simulação (`internal/service/sim`):** Desenvolvimento do motor físico que calcula velocidade e potência simulada com base na altimetria de arquivos GPX.
3. **Módulo de Armazenamento e Exportação (`internal/service/fit` e `strava`):** Geração local e criptografada de tokens de sessão, e rotinas de upload *multipart* para a nuvem.

## 4. Testes e Validação Experimental

A validação do software não se restringe a testes unitários, envolvendo testes de integração em ambiente real:

* **Benchmarking de Hardware:** Conexão simultânea de sensores reais (cintas cardíacas e rolos *smart*) para atestar a estabilidade e medir a latência da telemetria (requisitada para operar em $< 100\text{ms}$).
* **Validação de Conformidade:** Submissão dos arquivos `.fit` gerados pelo Argus Cyclist a plataformas de análise (Strava e Garmin Connect) para comprovar a exatidão estrutural, garantindo que o software opera nos padrões da indústria.
