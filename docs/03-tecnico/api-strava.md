# Integração API Strava e Ecossistema Web

O ecossistema do Argus Cyclist estende-se para a nuvem através do pacote `internal/service/strava`, que gere o ciclo de vida da integração com redes sociais de terceiros.

## 1. Fluxo de Autenticação (OAuth 2.0)

* **Geração de Credenciais:** O sistema redireciona o usuário para a página de consentimento do Strava solicitando o escopo `activity:write` (necessário para uploads de atividades privadas e públicas).
* **Gestão de Tokens:** Ao receber o código de autorização, o backend troca-o por um `access_token` (de curta duração) e um `refresh_token` (longa duração). O Go encarrega-se de atualizar o token silenciosamente em *background* sempre que este expira, poupando o atleta de repetidos logins.

## 2. Transmissão de Atividades

Ao finalizar um treino:

1. O arquivo binário `.fit` local é validado.
2. É construída uma requisição HTTP POST *Multipart/form-data* endereçada a `https://www.strava.com/api/v3/uploads`.
3. O Argus Cyclist transmite o arquivo com o *Data Type* definido estritamente como `fit`.
4. O backend realiza um monitoramento ( *polling* ) do status da requisição até que o Strava processe o arquivo assincronamente e retorne o ID da atividade gerada.
