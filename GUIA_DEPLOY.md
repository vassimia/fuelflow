# 🚀 FuelFlow — Guia de Deploy Completo
**GitHub + Vercel + Supabase**

---

## O que vais precisar
- Conta **GitHub** (gratuita) → github.com
- Conta **Vercel** (gratuita) → vercel.com
- Conta **Supabase** (gratuita) → supabase.com

Tempo estimado: **20–30 minutos**

---

## PARTE 1 — Supabase (Base de Dados)

### 1.1 — Criar projecto
1. Entra em **supabase.com** e clica **"Start your project"**
2. Cria conta com Google ou email
3. Clica **"New Project"**
4. Preenche:
   - **Name:** `fuelflow`
   - **Database Password:** escolhe uma senha forte (guarda-a!)
   - **Region:** escolhe `East US` ou qualquer um próximo
5. Clica **"Create new project"** — aguarda ~2 minutos

### 1.2 — Criar as tabelas
1. No painel Supabase, clica em **"SQL Editor"** (menu esquerdo)
2. Clica **"New query"**
3. Abre o ficheiro `supabase_schema.sql` deste projecto
4. Copia todo o conteúdo e cola no editor
5. Clica **"Run"** (ou Ctrl+Enter)
6. Deves ver: *"Success. No rows returned"*

### 1.3 — Copiar as credenciais
1. Vai a **Project Settings** (ícone engrenagem, menu esquerdo)
2. Clica **"API"**
3. Copia e guarda:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **anon / public key** → chave longa que começa com `eyJ...`

---

## PARTE 2 — GitHub (Código)

### 2.1 — Criar repositório
1. Entra em **github.com**
2. Clica no **"+"** (canto superior direito) → **"New repository"**
3. Preenche:
   - **Repository name:** `fuelflow`
   - Deixa em **Private** (recomendado)
4. Clica **"Create repository"**

### 2.2 — Fazer upload dos ficheiros
Na página do repositório vazio, clica **"uploading an existing file"**

Faz upload de **todos** estes ficheiros/pastas:
```
fuelflow/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── lib/
│       └── supabase.js
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
└── supabase_schema.sql
```

> ⚠️ **NÃO** faças upload do ficheiro `.env` — ele contém as tuas credenciais secretas!

Escreve uma mensagem de commit, ex: `"Initial commit"` e clica **"Commit changes"**

---

## PARTE 3 — Vercel (Deploy)

### 3.1 — Ligar ao GitHub
1. Entra em **vercel.com** e clica **"Sign Up"**
2. Escolhe **"Continue with GitHub"** — autoriza o acesso
3. Clica **"Add New Project"**
4. Encontra o repositório `fuelflow` e clica **"Import"**

### 3.2 — Configurar variáveis de ambiente
Antes de fazer deploy, clica em **"Environment Variables"** e adiciona:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | A tua Project URL do Supabase |
| `VITE_SUPABASE_ANON_KEY` | A tua anon key do Supabase |

### 3.3 — Deploy
1. Clica **"Deploy"**
2. Aguarda ~2 minutos
3. ✅ Pronto! O teu link aparece — ex: `fuelflow-xyz.vercel.app`

---

## PARTE 4 — Domínio personalizado (opcional)

Se quiseres um endereço próprio tipo `fuelflow.co.mz`:

1. No Vercel, vai ao teu projecto → **"Settings"** → **"Domains"**
2. Adiciona o teu domínio
3. Segue as instruções para configurar o DNS no teu registador de domínio

---

## Testar localmente (opcional)

Se quiseres testar no teu computador antes de fazer deploy:

```bash
# 1. Instalar Node.js em nodejs.org

# 2. Na pasta do projecto:
npm install

# 3. Criar ficheiro .env (copia o .env.example e preenche)
cp .env.example .env
# Edita o .env com as tuas credenciais Supabase

# 4. Iniciar servidor local
npm run dev

# Abre http://localhost:5173
```

---

## ❓ Problemas comuns

**"Failed to fetch" ou "Invalid API key"**
→ Verifica se as variáveis de ambiente no Vercel estão correctas
→ Após alterar variáveis, faz **Redeploy** no Vercel

**Tabelas não criadas**
→ Volta ao SQL Editor do Supabase e corre o schema novamente

**Dados não guardam**
→ Verifica em Supabase → Table Editor se as tabelas existem
→ Verifica se as Row Level Security policies foram criadas

---

## 🔒 Segurança futura

Actualmente a app está aberta (qualquer pessoa com o link pode aceder).
Para adicionar login/password, posso adicionar autenticação Supabase Auth numa próxima sessão.
