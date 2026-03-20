# Campos Compostagem 🌿

O **Campos Compostagem** é um aplicativo mobile desenvolvido com **React Native (Expo)** focado na gestão e monitoramento de processos de compostagem. O sistema permite o controle de leiras, medição de temperatura, monitoramento climático e gestão de materiais, contando com sincronização offline/online via Netlify Functions e Supabase.

## 🚀 Tecnologias

- **Frontend:** [React Native](https://reactnative.dev/) com [Expo SDK 54](https://expo.dev/)
- **Roteamento:** [Expo Router](https://docs.expo.dev/router/introduction/)
- **Banco de Dados Local:** [SQLite (expo-sqlite)](https://docs.expo.dev/versions/latest/sdk/sqlite/) para persistência offline
- **Backend/Database:** [Supabase](https://supabase.com/)
- **Serverless Functions:** [Netlify Functions](https://www.netlify.com/products/functions/)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)

## 📋 Pré-requisitos

Antes de começar, você vai precisar ter instalado:
- [Node.js](https://nodejs.org/) (versão LTS recomendada)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm install -g netlify-cli`)
- [Expo Go](https://expo.dev/client) no seu celular ou um emulador Android/iOS configurado.

## 🔧 Configuração

1. **Instalação de dependências:**
   ```bash
   npm install
   ```

2. **Variáveis de Ambiente:**
   As funções do Netlify utilizam variáveis de ambiente para conectar ao Supabase. Certifique-se de que o arquivo `netlify.toml` contém as chaves necessárias ou configure um arquivo `.env` para desenvolvimento local.

## 🏃 Como Rodar

O projeto possui comandos integrados para facilitar o desenvolvimento simultâneo do App e do Backend:

### Desenvolvimento Completo (App + Functions)
Inicia o servidor Metro do Expo e o simulador local do Netlify Functions:
```bash
npm run dev
```

### Outros Comandos
- **Rodar apenas o App:** `npm start`
- **Rodar apenas as Functions:** `npm run dev:functions`
- **Build Android:** `npm run dev:android`
- **Build iOS:** `npm run dev:ios`

## 📁 Estrutura do Projeto

- `app/`: Telas e roteamento (Expo Router).
- `components/`: Componentes de UI reutilizáveis (Botões, inputs, etc).
- `services/`: Lógica de negócio (Sincronização, Banco de Dados Local, API).
- `netlify/functions/`: Código das Serverless Functions (Backend).
- `lib/`: Configurações de bibliotecas externas (Supabase).
- `hooks/`: Hooks customizados do React.
- `types/`: Definições de tipos TypeScript.

## 🔄 Sincronização

O aplicativo utiliza um sistema de fila (`services/queue.ts`) para armazenar operações realizadas offline. Quando há conexão, o serviço de sincronização (`services/sync.ts`) processa essa fila enviando os dados para as Netlify Functions, que por sua vez atualizam o banco de dados central no Supabase.

---
Desenvolvido por **Campos Solo**.
