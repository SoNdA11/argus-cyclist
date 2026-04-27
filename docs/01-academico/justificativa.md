# Justificativa

O desenvolvimento do sistema **Argus Cyclist** justifica-se por sua alta relevância nas dimensões acadêmica, tecnológica e social, configurando-se como um projeto de Engenharia de Software capaz de resolver problemas reais do ecossistema esportivo.

**1. Relevância Tecnológica e Inovação:**
Do ponto de vista da Ciência da Computação, o projeto propõe um desafio arquitetural complexo: o processamento concorrente e em tempo real de sinais de hardware (sensores BLE). A adoção do framework **Wails** e a linguagem **Go (Golang)** no backend justificam-se pela necessidade de altíssimo desempenho, segurança de memória e concorrência nativa (goroutines) no tratamento dos protocolos GATT/BLE, garantindo uma latência imperceptível. O encapsulamento dessa complexidade por trás de uma interface web reativa (Vite) e a portabilidade via Capacitor (Mobile) demonstram a aplicação do estado da arte em desenvolvimento de software multiplataforma.

**2. Impacto Social e Fomento ao Esporte:**
Ao propor uma arquitetura limpa e independente de assinaturas onerosas em dólar, o Argus Cyclist democratiza o treinamento esportivo de alto rendimento. Ele permite que ciclistas locais utilizem rolos de treino *smart* e medidores de potência com um software de interface amigável, promovendo a saúde e a inclusão digital no esporte.

**3. Soberania Tecnológica e Padronização:**
A criação de uma solução nacional reduz a dependência de caixas-pretas proprietárias. O projeto atua ativamente na implementação e manipulação de padrões globais de engenharia esportiva — como a decodificação do protocolo FTMS, a modelagem de arquivos binários `.FIT` (Flexible and Interoperable Data Transfer) e a integração segura via OAuth 2.0 com APIs globais (Strava).

**4. Relevância Acadêmica (Contexto TCC):**
Para o escopo de um Trabalho de Conclusão de Curso, o projeto transcende o desenvolvimento de um simples sistema de informação. Ele exige conhecimentos avançados em comunicação de rede de baixo nível, engenharia de software modular, matemática aplicada (motores de simulação física baseada em dados `.gpx` e arrasto aerodinâmico) e experiência de usuário (UX). Consequentemente, resulta em um artefato robusto, perfeitamente elegível para o registro de software junto ao INPI.

Para o curso de Ciência da Computação/Engenharia da UERN, o projeto serve como um registro de software robusto que abrange desde o tratamento de sinais de sensores até o processamento de dados em nuvem.
