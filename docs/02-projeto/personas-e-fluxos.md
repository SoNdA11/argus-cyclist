# Personas e Jornada do Usuário

## 1. Personas e Casos de Uso

* **Carlos, o Atleta de Elite:** Ciclista competitivo e focado em alta performance. Ele utiliza o software para executar blocos rigorosos de treinamento intervalado e simular as demandas exatas de seu calendário de provas. Carlos faz o upload do arquivo GPX do percurso de sua competição alvo, como o campeonato nacional, para memorizar os pontos de ataque, subidas e sprints. Ele exige precisão na leitura de potência (Watts) e necessita da integração imediata com o Strava para que seu treinador analise a progressão do estresse de treino (TSS) a partir do arquivo `.fit`.

* **Mariana, a Entusiasta Digital:** Praticante de ciclismo indoor focada em saúde, consistência e cicloturismo virtual. Ela busca uma interface limpa, intuitiva e que suporte o modo escuro (*Dark Theme*) para seus treinos noturnos. Mariana utiliza o sistema para importar rotas clássicas europeias — como as etapas de montanha na França. Como o Argus Cyclist dispensa motores gráficos 3D pesados, Mariana consegue rodar o simulador fluidamente em seu notebook de trabalho, acompanhando sua progressão pelo mapa e sentindo a resistência fiel da altimetria francesa (gradiente) diretamente em seu rolo de treino, sem a necessidade de um computador *gamer*.

### 2. Fluxo Operacional (Jornada do Sistema)

A jornada do usuário foi mapeada para demonstrar a interação fluida entre a interface reativa (*Frontend*) e os microsserviços de baixo nível (*Backend em Go*).

1. **Descoberta e Configuração (Setup):** O usuário inicializa a aplicação. Em segundo plano, o backend em Go instila o `BLEService`, ativando a varredura (scan) das portas Bluetooth do sistema operacional para detectar periféricos compatíveis (Heart Rate, Power Meters e Smart Trainers) num raio próximo.
2. **Pareamento e Telemetria (Handshake):** Através da interface de usuário (*UI*), o ciclista seleciona os dispositivos desejados. O sistema estabelece conexões persistentes via protocolo GATT (*Generic Attribute Profile*), assinando as características de notificação para receber dados em tempo real com latência mínima.
3. **Sessão de Treino e Motor de Física:** Durante o esforço físico, o sistema processa os arrays de telemetria continuamente. Caso uma rota (`.gpx`) esteja carregada no `MapController`, o motor de simulação (Engine) cruza a posição GPS virtual com o gráfico de elevação (`ElevationChart`). A resistência do rolo de treino é então ajustada dinamicamente via comandos FTMS/FE-C para replicar a gravidade e o arrasto aerodinâmico.
4. **Análise e Persistência de Dados:** Ao encerrar a sessão, o `FitService` compila o buffer de amostras temporais (BPM, Watts, Cadência, Coordenadas) e estrutura um arquivo binário padronizado (`.fit`). A interface exibe os gráficos consolidados de performance (Dashboard Pós-Treino).
5. **Sincronização e Distribuição Social:** Com o consentimento do usuário (via *OAuth 2.0*), o módulo de rede do Go aciona a API do Strava. O sistema realiza o upload multipart do arquivo encriptado, confirmando o sucesso da publicação e integrando o treino ao ecossistema global do atleta.
