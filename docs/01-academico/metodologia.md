# Metodologia

> **Fonte única de verdade:** a metodologia completa está em
> **[`trabalho-ptcc-2026.md`](./trabalho-ptcc-2026.md)** (seção 5). Este arquivo
> complementa com os detalhes de implementação (caminhos dos módulos).

Pesquisa de natureza **aplicada**, abordagem quali-quantitativa, com **desenvolvimento
iterativo e incremental** (práticas ágeis). Quatro fases:

## 1. Levantamento e Especificação

Análise de mercado (Zwift, Rouvy, Mywhoosh) para identificar lacunas de performance e
acessibilidade. Mapeamento dos protocolos essenciais:

* **BLE/GATT:** UUIDs padrão para Heart Rate (`0x180D`), Cycling Power (`0x1818`) e
  Fitness Machine (`0x1826`).
* **Formato de dados:** protocolo `.FIT` da Garmin para sessões.
* **API de terceiros:** fluxo OAuth 2.0 e endpoints RESTful do Strava.

## 2. Definição Arquitetural

* **Backend (Go):** processamento assíncrono, subsistema Bluetooth do SO, motor de simulação
  (parse de GPX) e serialização binária.
* **Bridge (Wails):** canal IPC rápido entre Go e a interface gráfica.
* **Frontend (JavaScript/Vite):** interface rica, responsiva e leve.
* **Mobile (Capacitor):** injeção da interface web em dispositivos móveis, reaproveitando o
  frontend.

## 3. Implementação e Codificação

Módulos autônomos, com refatoração para escalabilidade e design *offline-first*:

1. **Hardware (`internal/service/ble`):** clientes genéricos e *mocks* para varredura/conexão
   GATT concorrente.
2. **Simulação e gamificação (`internal/service/sim`):** motor físico de velocidade/potência
   com interações em tempo real (Sprints, testes de FTP, KOM).
3. **Persistência (`internal/repository/sqlite` + `internal/usecase/storage_facade`):**
   banco embutido sob *Repository Pattern*, orquestrado por *Facade*.
4. **Exportação (`internal/service/fit` + `strava`):** geração de arquivos `.fit` e uploads
   *multipart* seguros para terceiros.

## 4. Testes e Validação Experimental

* **Benchmarking de hardware:** conexão simultânea de sensores reais para atestar estabilidade
  e medir latência de telemetria (requisito: **< 150 ms** — ver [`requisitos.md` RNF01](../02-projeto/requisitos.md)).
* **Validação de conformidade:** submissão dos arquivos `.fit` a Strava e Garmin Connect para
  comprovar exatidão estrutural e aderência ao padrão da indústria.
