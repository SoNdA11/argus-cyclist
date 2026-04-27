# Arquitetura do Sistema e Engenharia de Software

O **Argus Cyclist** foi projetado sob os princípios da *Clean Architecture*, promovendo uma separação estrita entre a camada de apresentação, regras de negócio e acesso a hardware/rede. A solução adota um modelo híbrido (*Desktop/Mobile*), centralizando a lógica pesada em uma linguagem de sistema.

## 1. Stack Tecnológico (Core)

* **Linguagem de Backend:** Go (Golang). Escolhida pela eficiência no gerenciamento de concorrência (*Goroutines*) e baixo consumo de memória, essenciais para manter conexões contínuas com múltiplos sensores BLE simultaneamente sem bloquear a *thread* principal.
* **Bridge IPC (Inter-Process Communication):** O framework **Wails** é utilizado para exportar os métodos Go (*structs*) para o frontend, criando ligações assíncronas nativas.
* **Frontend:** Implementado com Vite, Vue/Vanilla JS e CSS puro, focando em reatividade em tempo real (atualização de tela a 60fps) e suporte nativo a *Dark Mode*.
* **Mobile (Cross-Platform):** Integração com **Capacitor** para encapsular a aplicação Web em binários para Android, reutilizando a interface e substituindo chamadas de hardware de desktop por APIs móveis.

## 2. Topologia de Microsserviços Internos

A aplicação backend está subdividida em serviços de domínio estrito:

* `ble`: Camada de abstração do hardware. Responsável pelo *scan* e *handshake* GATT.
* `sim` (Engine de Simulação): Motor físico que processa vetores de inclinação (GPX) e potência do ciclista para calcular métricas derivadas (como velocidade virtual e arrasto).
* `fit`: Serviço de processamento de matrizes de dados e serialização. Agrega as métricas de performance minuto a minuto e as converte no padrão binário `.fit`.
* `strava`: Cliente REST para integração com a nuvem esportiva via OAuth 2.0.
