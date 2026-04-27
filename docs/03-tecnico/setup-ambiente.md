# Configuração do Ambiente de Desenvolvimento

Para garantir a reprodutibilidade metodológica — requisito indispensável no escopo do TCC — detalha-se o processo de montagem do ambiente para compilação do código fonte do Argus Cyclist.

## 1. Pré-requisitos de Sistema

* **Compilador:** Go versão 1.21 ou superior (Necessário para suporte a concorrência avançada e generics).
* **Node & Package Manager:** Node.js 18+ com NPM para compilação dos *assets* do Vite.
* **Bibliotecas CGO (Linux/Ubuntu):** `sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev` (Essenciais para o motor de renderização da janela do sistema hospedeiro via Wails).
* **CLI Engine:** Instalação global do Wails v2: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`.

## 2. Compilação e Execução

1. Realize o clone do repositório: `git clone <repo-url> argus-cyclist`
2. No diretório raiz, execute `wails dev`. O motor do Wails fará a ponte entre o servidor Go e ativará o modo *Hot-Reload* do Vite no navegador.
3. Para compilar a *Release* final (binário executável sem dependências web visíveis), utilize: `wails build -clean`. O executável será gerado na pasta `build/bin`.
