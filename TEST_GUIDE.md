# Guia de Testes: Suporte ANT+ FE-C no Argus Cyclist

Este guia descreve como validar a implementação do protocolo ANT+ FE-C, modo ERG e simulação de subida.

## 1. Validação de Conexão
1. Abra o Argus Cyclist e vá em **Settings** (ícone de engrenagem).
2. Clique no ícone de conexão ao lado de **Trainer**.
3. O log deve mostrar: `Searching for Trainer (FTMS/FEC)...`.
4. Ao conectar o ThinkRider X2 Max, o status deve mudar para `Trainer Connected`.
5. No console/log do backend, você deve ver: `[BLE] FEC Control Point Found.` se o rolo for detectado como FEC.

## 2. Teste do Modo ERG (Potência Alvo)
1. Em **Settings**, localize a seção **Trainer Control (ANT+ FE-C)**.
2. Mude o **Mode** para `ERG (Target Power)`.
3. Insira um valor (ex: `200`) e clique em **Set**.
4. **Resultado Esperado:** Você deve sentir o rolo ajustar a resistência imediatamente para manter 200W, independentemente da sua cadência.

## 3. Teste de Simulação de Subida (Grade)
1. Importe um arquivo GPX com variações de altitude.
2. Clique em **START RIDE**.
3. Certifique-se de que o modo do rolo está em `Simulation (Grade)`.
4. Observe o campo **Grade** no HUD lateral.
5. **Resultado Esperado:** Quando a grade subir (ex: 5% ou 8%), a resistência no pedal deve aumentar proporcionalmente. Em descidas (grade negativa), a resistência deve diminuir.

## 4. Teste de Telemetria
1. Comece a pedalar.
2. Verifique se os campos **Power** (Watts) e **Cadence** (RPM) no HUD estão atualizando.
3. **Nota:** A telemetria FEC usa a Página 25 para obter esses dados de forma combinada.

## 5. Resolução de Problemas
- Se o rolo não for detectado, verifique se ele não está conectado a outro aplicativo (Zwift, Auuki, etc).
- Se a resistência não mudar, verifique no log se o `CharFECWrite` foi encontrado com sucesso.
