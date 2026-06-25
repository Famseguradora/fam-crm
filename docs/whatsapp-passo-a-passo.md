# WhatsApp do Comitê no CRM FAM — Passo a passo (Z-API)

> Objetivo: ligar o WhatsApp do Comitê **de verdade** usando a **Z-API** (API não-oficial),
> sem depender da Meta/Facebook. Você precisa de **1 número remetente** (o "bot"): pode ser
> o seu próprio celular no teste grátis (2 dias) ou — recomendado — um **chip pré-pago
> dedicado** (~R$15) para não arriscar seu número pessoal.
>
> No fim: o subscritor clica **📲 Enviar convite** e os diretores recebem o convite/votação
> no WhatsApp; e quem é admin manda **FAM** e recebe o menu de relatórios.

⚠️ **Risco:** API não-oficial contraria os Termos da Meta — o número conectado pode ser
banido. Com volume baixo (50–100 msgs/mês) e conteúdo conversacional o risco é baixo, e se
acontecer basta conectar outro chip.

---

## Antes de começar — o que você vai coletar

Ao longo do caminho você vai anotar **5 valores** (deixe um bloco de notas aberto):

| Variável | O que é | Onde aparece |
|---|---|---|
| `ZAPI_BASE_URL` | Base da API (já vem pronta) | use `https://api.z-api.io` |
| `ZAPI_INSTANCE_ID` | ID da sua instância | Parte 2 |
| `ZAPI_TOKEN` | Token da instância | Parte 2 |
| `ZAPI_CLIENT_TOKEN` | Token de segurança (header) | Parte 2 |
| `ZAPI_WEBHOOK_SECRET` | Uma senha que **você inventa** | Parte 4 (ex.: `fam-crm-zapi-2026`) |

---

## Parte 1 — Criar a conta e a instância na Z-API

1. Acesse **https://www.z-api.io** e crie sua conta (há **2 dias grátis** para testar).
2. No painel, crie **1 instância** (plano "Ultimate" ~R$99,99/mês, mensagens ilimitadas, 1 número).
3. Abra a instância recém-criada — ela vai mostrar um **QR Code**.

---

## Parte 2 — Conectar o número e pegar 3 valores

1. **Número remetente:** decida qual WhatsApp será o bot (seu celular no teste, ou o chip dedicado).
2. No celular do bot: WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** → leia o
   **QR Code** do painel da Z-API (igual ao WhatsApp Web).
3. Após conectar, o painel mostra **Instance ID** e **Token**:
   - 👉 Copie como `ZAPI_INSTANCE_ID` e `ZAPI_TOKEN`.
4. No menu **Segurança** (Security) da instância, copie o **Client-Token**:
   - 👉 Copie como `ZAPI_CLIENT_TOKEN`.

> ✅ Você já tem 3 dos valores. O `ZAPI_WEBHOOK_SECRET` você inventa (Parte 4) e o
> `ZAPI_BASE_URL` é `https://api.z-api.io`.

---

## Parte 3 — Publicar o CRM com as variáveis (Vercel)

O webhook precisa de um endereço público HTTPS. O CRM já roda na **Vercel**.

1. Acesse **https://vercel.com** → projeto **fam-crm** → **Settings → Environment Variables**.
2. Adicione as **5 variáveis** abaixo (ambiente **Production**):

   | Name | Value |
   |---|---|
   | `ZAPI_BASE_URL` | `https://api.z-api.io` |
   | `ZAPI_INSTANCE_ID` | (anotado) |
   | `ZAPI_TOKEN` | (anotado) |
   | `ZAPI_CLIENT_TOKEN` | (anotado) |
   | `ZAPI_WEBHOOK_SECRET` | `fam-crm-zapi-2026` (o seu) |

3. **Importante:** confirme que `NEXT_PUBLIC_SANDBOX` **não** existe / não é `true` em Production
   (senão o CRM entra no modo simulador e não envia de verdade).
4. Faça o **deploy**: `git push` da branch com estes arquivos (a Vercel publica sozinha) ou
   **Deployments → ... → Redeploy**.
5. Seu endereço do webhook será:
   **`https://SEU-APP.vercel.app/api/whatsapp/webhook?secret=fam-crm-zapi-2026`**
   (troque `SEU-APP.vercel.app` pelo domínio real, em **Settings → Domains**).

---

## Parte 4 — Apontar o webhook "Ao receber" na Z-API

1. No painel da Z-API, abra sua instância → **Webhooks** (ou Configurações).
2. No campo **Ao receber** (On message received), cole a URL **completa com o secret**:
   `https://SEU-APP.vercel.app/api/whatsapp/webhook?secret=fam-crm-zapi-2026`
3. Salve. (Só esse webhook é necessário; não precisa ativar "ao enviar / fromMe".)

---

## Parte 5 — Cadastrar os participantes no CRM

1. Entre no CRM FAM como **admin**.
2. **Diretores do Comitê:** em **Usuários**, marque cada diretor votante com **🏛 Membro do
   Comitê** e preencha o **Telefone** (pode ser com máscara `(11) 99999-8888` — comparamos só
   os dígitos). Status = **ativo**.
3. **Quem consulta relatórios pelo "FAM":** **qualquer usuário cadastrado e ativo** com
   telefone preenchido (não precisa ser admin). Externos (não cadastrados) nunca acessam.
4. (Banco — uma vez) rode `supabase-whatsapp.sql` no **Supabase → SQL Editor** (cria o índice
   de telefone; o resto já está aplicado).

---

## Parte 6 — Teste de ponta a ponta 🎉

**Menu gerencial:**
1. Do celular de um **admin**, mande **`FAM`** para o número do bot.
2. Você recebe o **menu** (Comitê / Aprovadas / Emitidas). Toque num botão → recebe o card de KPIs.

**Comitê:**
1. No CRM, mova uma operação para o status **Comitê** e clique **📲 Enviar convite**.
2. Os diretores recebem o convite com os botões **📄 Ver análise** e **🗳️ Votar**.
3. Toque em **Votar** → escolha **✅/⚠️/❌** (ou responda **1/2/3**).
4. O voto cai em `comite_votos`, a tela do Comitê atualiza **ao vivo**, e o WhatsApp responde
   o **placar parcial**; ao fechar o quórum, manda o **veredito**.

---

## Se algo não funcionar

- **Nada acontece ao mandar FAM / votar:**
  - O webhook **Ao receber** está com a URL **incluindo `?secret=...`**? (Parte 4)
  - O `ZAPI_WEBHOOK_SECRET` na Vercel é **idêntico** ao secret da URL? (Parte 3/4)
  - A instância está **conectada** no painel da Z-API? (telefone do bot online)
  - O seu telefone está no CRM com **comite** (p/ votar) ou **admin** (p/ relatórios) + ativo?
- **O convite não chega a um diretor:**
  - O diretor tem `comite=true` + telefone? O número está correto (com DDD)?
- **Os botões não aparecem no aparelho do diretor:**
  - Ele pode **responder 1/2/3** (fallback numérico já tratado pelo sistema).
- **O número do bot caiu / desconectou:**
  - Reabra a instância na Z-API e leia o QR de novo. Se foi banido, conecte outro chip.

---

### Mapa rápido: painel Z-API → variável

```
Z-API ▸ Instância (após ler o QR)
  ├─ Instance ID .......... ZAPI_INSTANCE_ID
  └─ Token ................ ZAPI_TOKEN
Z-API ▸ Segurança
  └─ Client-Token ........ ZAPI_CLIENT_TOKEN
Você inventa ............. ZAPI_WEBHOOK_SECRET   (vai na URL do webhook: ?secret=...)
Fixo ..................... ZAPI_BASE_URL = https://api.z-api.io
```
