# FuelFlow v2 — Guia de instalação

App de gestão da Estação de Serviço Quelimane: turnos e leituras das bombas, lançamentos a crédito, pagamentos, faturas, tanques e stock.

- **Admin** (computador): painel, turnos, clientes e extratos, faturas, stock, relatórios, configuração.
- **Operador** (telemóvel): abre o turno com os contadores herdados do fecho anterior, regista lançamentos a crédito e outras vendas, e fecha o turno com os valores entregues.

---

## 1. Base de dados (Supabase)

O FuelFlow v2 usa o **mesmo projecto Supabase** do app antigo (`xsvdgggdgiibqcfaozzs`), mas guarda tudo num schema separado chamado `fuelflow`. As tabelas e os dados do app antigo (schema `public`) não são tocados.

1. No Supabase, abre **SQL Editor → New query**, cola o conteúdo de `supabase/schema.sql` e clica **Run**. Deve terminar com "Success".
2. Vai a **Project Settings → Data API → Exposed schemas**, acrescenta `fuelflow` e clica **Save**.
3. **Conta de admin.** O teu email já tem conta no Supabase por causa do app antigo. Abre `supabase/admin.sql`, troca `MUDA_ESTA_SENHA` pela senha que queres, cola no SQL Editor e clica **Run**. Entras no app com `vassim` (ou o email) e essa senha.
4. Em **Authentication → Sign In / Providers → Email**, confirma que **"Allow new users to sign up"** está ligado e **"Confirm email"** está desligado. Sem isto, os operadores não conseguem entrar.

> A chave `service_role` nunca é usada pelo app. Não a coloques no Vercel.

## 2. Publicar (Vercel)

1. No projecto do Vercel, vai a **Settings → Environment Variables** e cria:
   - `VITE_SUPABASE_URL` = o Project URL
   - `VITE_SUPABASE_ANON_KEY` = a chave anon public

   Como é o mesmo projecto Supabase, estas variáveis já existem no Vercel do app antigo e não precisam de mudar.
2. Faz **Redeploy**.

Para testar no teu computador: copia `.env.example` para `.env`, preenche, e corre `npm install` e `npm run dev`.

## 3. Primeiro arranque

1. Abre o app e entra com a conta de admin do passo 1.3.
2. Em **Configuração**:
   - **Empresa**: NUIT, contacto e dados bancários (aparecem nas faturas e extratos).
   - **Produtos e preços**: põe os preços da Gasolina e do Gasóleo e acrescenta lubrificantes, se venderes.
3. Em **Tanques e stock → Novo tanque**: um por tanque, com a capacidade e o nível medido hoje.
4. Em **Configuração → Bombas e mangueiras**: uma por mangueira, com o produto, o tanque de onde sai e o **contador actual** (o número que a bomba mostra).
5. Em **Configuração → Utilizadores → Novo operador**: nome, nome de utilizador e senha. O operador entra no telemóvel com esse nome de utilizador.
6. Em **Clientes → Novo cliente**: as empresas que abastecem a crédito, com o limite de crédito.

## Como funciona

**Turno**: o operador escolhe as mangueiras. As leituras iniciais são as finais do turno anterior e não podem ser alteradas. No fecho escreve as leituras finais e os valores entregues (numerário, M-Pesa, e-Mola, POS e despesas). O app calcula:

> A entregar = vendas nas bombas + outras vendas − lançamentos a crédito de combustível
> Diferença = entregue − a entregar

Ao fechar, os contadores das mangueiras e o stock dos tanques são actualizados. O admin **valida** o turno ou **reabre-o** para corrigir. Só pode reabrir o último turno de cada mangueira.

**Crédito**: cada lançamento fica no extrato do cliente. Os pagamentos baixam o saldo. **Emitir fatura** junta os lançamentos ainda não faturados de um período (numeração `FT 2026/0001`…). Extratos e faturas imprimem-se ou guardam-se em PDF com o botão Imprimir.

**Stock**: o nível desce com cada turno fechado e sobe com cada recepção. As **medições** (vareta) mostram a diferença entre o tanque e o sistema e podem corrigir o nível.

**Senhas**: o admin define a senha de qualquer operador em Configuração → Utilizadores. Se o admin perder a própria senha, corre no SQL Editor do Supabase:

```sql
update auth.users
set encrypted_password = extensions.crypt('NOVA_SENHA', extensions.gen_salt('bf'))
where email = 'o-teu-email@gmail.com';
```

## Segurança

- Os operadores só vêem os seus turnos e só alteram o turno que têm aberto.
- O preço dos lançamentos do operador é sempre o preço actual do produto; só o admin o pode mudar.
- Novas contas criadas fora do app ficam inactivas até o admin as activar.

## Ficheiros

- `supabase/schema.sql`: base de dados completa (tabelas, regras de acesso, funções de turno e fatura).
- `supabase/test/`: testes locais do schema. **Não** correr `mock_supabase.sql` no Supabase real.
- `src/admin/`: ecrãs do administrador.
- `src/operator/`: app do operador.
