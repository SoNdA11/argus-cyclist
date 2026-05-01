# Especificação de Requisitos

A especificação de requisitos do Argus Cyclist foi derivada da necessidade de estabilidade em tempo real e conformidade com os padrões de arquivos esportivos.

## Requisitos Funcionais (RF)

* **RF01 - Gestão de Sensores BLE:** O sistema deve ser capaz de realizar o escaneamento, pareamento e recepção de dados via perfis GATT de sensores de frequência cardíaca (HRM), potência (CycPWR) e cadência.
* **RF02 - Controle de Equipamento (FTMS/FEC):** O sistema deve enviar comandos de resistência para rolos de treino inteligentes, permitindo o modo ERG ou simulação de inclinação.
* **RF03 - Motor de Simulação GPX:** O sistema deve interpretar arquivos de rota (GPX) e calcular a velocidade virtual baseada no peso do atleta, potência gerada e inclinação do terreno.
* **RF04 - Registro de Atividade (FIT SDK):** O sistema deve gerar arquivos binários no padrão `.fit` (Flexible and Interoperable Data Transfer), contendo todos os samples de telemetria da sessão.
* **RF05 - Integração Strava API:** O sistema deve gerenciar a autenticação via OAuth 2.0 e realizar o upload automático de sessões finalizadas para o perfil do usuário.
* **RF06 - Persistência de Dados Local:** O sistema deve armazenar os dados do usuário, configurações, histórico de atividades e recordes pessoais (PRs) localmente utilizando um banco de dados relacional embutido (SQLite).
* **RF07 - Desafios e Gamificação:** O sistema deve apresentar desafios de segmentos (*Sprints* e *KOM - King of the Mountain*) e avaliações de capacidade (teste *FTP*) durante a simulação de rotas ou sessões livres.

## Requisitos Não Funcionais (RNF)

* **RNF01 - Latência de Telemetria:** O tempo entre a recepção do pacote BLE e a atualização na interface visual não deve exceder 150ms, utilizando um *Event Bus* no frontend para desacoplar a recepção de dados da renderização.
* **RNF02 - Portabilidade Multiplataforma:** A base de código deve ser compilável para Windows (Wails), Linux e Android (Capacitor) sem perda de funcionalidades core.
* **RNF03 - Estabilidade de Conexão:** O sistema deve implementar rotinas de auto-reconexão para sensores que percam sinal momentaneamente durante a sessão.
* **RNF04 - Eficiência de Memória:** O backend em Go não deve exceder 200MB de footprint de memória durante a simulação ativa.
