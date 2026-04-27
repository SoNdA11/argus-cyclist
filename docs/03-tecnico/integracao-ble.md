# Integração de Hardware e Protocolo BLE

O módulo de comunicação com dispositivos periféricos (`internal/service/ble`) foi desenhado para lidar com a natureza assíncrona e muitas vezes instável do sinal Bluetooth em ambientes residenciais.

## 1. Perfis GATT Utilizados

O sistema realiza assinaturas ( *Subscriptions* / *Notifications*) nas características padrão do consórcio Bluetooth SIG:

* **Heart Rate Service (`0x180D`):** Leitura de batimentos cardíacos (BPM).
* **Cycling Power Service (`0x1818`):** Recepção de telemetria de Watts e Cadência integrada.
* **Fitness Machine Service (FTMS - `0x1826`):** Protocolo bidirecional. Usado tanto para receber os dados do Rolo de Treino *Smart* quanto para enviar comandos de resistência (Target Power / Modo ERG ou Inclinação Simulada).

### 2. Fluxo de Leitura (Concorrência)

Para garantir latência $< 150\text{ms}$:

1. Uma rotina de varredura identifica o MAC Address ou UUID do dispositivo.
2. Após a conexão, o sistema aloca uma *Goroutine* dedicada para cada sensor pareado.
3. Cada pacote hexadecimal recebido é decodificado, tratado (remoção de ruídos de sinal) e despachado para um *Channel* (canal do Go) central, que por sua vez alimenta a interface (via Wails Event Emitter) e o buffer de gravação do `.fit`.
