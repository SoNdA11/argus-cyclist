# Modelo de Dados e Processamento de Métricas

O Argus Cyclist não atua apenas como um passador de dados; ele atua como um agregador e calculador de telemetria esportiva. Os dados transitam pelo sistema em *buffers* circulares que são processados para gerar as métricas de performance do usuário.

## 1. Entidades Principais (Domain Driven Design)

As estruturas (*Structs*) centrais do domínio localizam-se em `internal/domain/`:

* **`Workout` (Sessão):** Entidade raiz. Contém metadados essenciais (Timestamp de Início/Fim, Nome do Atleta, Dispositivos Conectados) e o resumo estatístico global.
* **`MetricSample` (Amostra Temporal):** O menor átomo de informação. Um vetor contendo o *timestamp* da leitura, Watts, RPM (Cadência), BPM (Coração), Altitude e Velocidade instantânea. Gravado a uma frequência de 1Hz (uma vez por segundo).

## 2. Motor de Métricas de Performance (`fit/metrics`)

Durante e após a sessão, o motor de métricas varre o array de `MetricSamples` para calcular a performance do usuário, extraindo dados vitais para a avaliação física:

* **Métricas Absolutas:** Trabalho total realizado (*Energy Expenditure*) em quilojoules (kJ), convertido para calorias estimadas.
* **Métricas de Agregação:** Potência Média (W), Frequência Cardíaca Média e Máxima, Cadência Média.
* **Distribuição de Esforço:** Análise de picos de potência (ex: *Sprint* de 5, 10 e 30 segundos) com base no array consolidado.

## 3. Persistência e Padrão `.FIT`

Para garantir que as métricas calculadas sejam aceitas universalmente, o Argus consolida os metadados e os *samples* 1Hz formatando-os rigorosamente no formato de arquivo **FIT (Flexible and Interoperable Data Transfer)**. Isso assegura interoperabilidade total com o Strava, TrainingPeaks e Garmin Connect.
