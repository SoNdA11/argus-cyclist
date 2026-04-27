# Segurança, Privacidade e Tratamento de Dados

Sendo um software que coleta dados biométricos (frequência cardíaca) e geográficos (se rotas GPX baseadas na localização do atleta forem importadas), a arquitetura do Argus Cyclist preza pela privacidade *Privacy-by-Design*.

## 1. Processamento Isolado (Edge Computing)

Diferente de aplicações baseadas em nuvem, **todo o processamento biométrico e cálculo matemático de métricas ocorre localmente** na máquina do usuário (*Edge*). O Argus Cyclist não possui bancos de dados remotos próprios.

## 2. Criptografia de Credenciais

Os tokens do Strava (Access e Refresh) e identificadores do atleta não ficam expostos em texto claro em variáveis globais. São persistidos em arquivos locais do sistema operacional do usuário utilizando proteção de diretório e ofuscação simples.

## 3. Consentimento de Compartilhamento

Nenhum byte de telemetria é enviado à internet sem ação explícita. O envio (Upload) para o Strava é inteiramente opcional, funcionando na modalidade *Opt-In* ao final do treino. Caso contrário, a privacidade é absoluta e o treino reside apenas no disco rígido.
