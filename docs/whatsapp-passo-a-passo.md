# WhatsApp no CRM FAM — Passo a passo (modo teste)

> Objetivo: ligar a integração de WhatsApp **em modo de teste**, sozinho, sem tocar
> em número real da FAM e sem envolver o diretor. Remetente = número de teste **grátis**
> da Meta. Destinatário = **seu próprio celular**. Nenhum documento necessário nesta fase.

No fim, você manda **FAM** no WhatsApp e recebe o menu com **Comitê / Aprovadas / Emitidas**.

---

## Antes de começar — o que você vai coletar

Ao longo do caminho você vai anotar **5 valores**. Deixe um bloco de notas aberto:

| Variável | O que é | Onde aparece |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número de teste (não é o número) | Parte 2 |
| `WHATSAPP_TOKEN` | Token de acesso | Parte 2 |
| `WHATSAPP_APP_SECRET` | Segredo do app | Parte 2 |
| `WHATSAPP_VERIFY_TOKEN` | Uma senha que **você inventa** | Parte 4 |
| `WHATSAPP_BANNER_URL` | Endereço do banner | Parte 4 |

Sugestão de valor para o `WHATSAPP_VERIFY_TOKEN` (pode ser qualquer texto seu):
`fam-crm-verify-2026`

---

## Parte 1 — Criar a conta e o app na Meta

1. Acesse **https://developers.facebook.com** e clique em **Entrar** (canto superior direito).
   - Você pode logar com seu Facebook pessoal **ou** criar uma conta nova com o e-mail
     `marco.dragone@famseguradora.com.br`. Tanto faz para teste.
2. No topo, clique em **Meus Apps** (My Apps) → botão verde **Criar app** (Create App).
3. Na pergunta **"O que você quer que seu app faça?"**, marque **Outro** (Other) e clique **Avançar**.
4. Em **tipo de app**, escolha **Empresa** (Business) → **Avançar**.
5. Preencha:
   - **Nome do app**: `CRM FAM WhatsApp` (uso interno, pode ser o que quiser)
   - **E-mail de contato**: seu e-mail
   - **Portfólio empresarial** (Business portfolio): se pedir, clique para **criar um novo**
     — não precisa verificar nada agora, só dar um nome (ex.: `FAM Seguradora`).
6. Clique **Criar app**. Pode pedir sua senha do Facebook para confirmar.

> ✅ Você está no **Painel do app**. Nada aqui ainda incomoda ninguém — é tudo seu, em teste.

---

## Parte 2 — Adicionar o WhatsApp e pegar 3 dos 5 valores

1. No painel do app, role até **Adicionar produtos** (Add products) e, no card **WhatsApp**,
   clique **Configurar** (Set up).
2. Se pedir para vincular um portfólio empresarial, selecione o que você criou e continue.
3. No menu lateral esquerdo aparece **WhatsApp → Configuração da API** (API Setup / Começar).
   Abra essa tela. Aqui tem quase tudo:

   - **De (From):** já vem um **número de teste** pronto, fornecido pela Meta. Logo abaixo dele
     aparece **"ID do número de telefone"** (Phone number ID) — um número longo.
     👉 **Copie** e anote como `WHATSAPP_PHONE_NUMBER_ID`.

   - **Token de acesso temporário** (Temporary access token): um texto longo começando com `EAAG...`.
     👉 **Copie** e anote como `WHATSAPP_TOKEN`.
     ⚠️ Esse token **expira em 24h** — ótimo para a 1ª validação. (Como deixar permanente: ver
     **Apêndice A**, opcional.)

4. Agora o **App Secret**:
   - No menu lateral, vá em **Configurações do app → Básico** (App settings → Basic).
   - No campo **Chave secreta do app** (App secret), clique **Mostrar**, confirme a senha.
   - 👉 **Copie** e anote como `WHATSAPP_APP_SECRET`.

> Você já tem 3 dos 5 valores: `PHONE_NUMBER_ID`, `TOKEN`, `APP_SECRET`.

---

## Parte 3 — Cadastrar SEU celular e testar pelo próprio painel da Meta

Antes de mexer no CRM, vale confirmar que a Meta consegue te mandar mensagem.

1. Volte em **WhatsApp → Configuração da API**.
2. No bloco **Para (To)**, clique em **Gerenciar lista de números** (ou no seletor) e
   **adicione o seu número pessoal** (com DDI: ex. `+55 11 9XXXX-XXXX`).
3. A Meta vai te mandar um **código no seu WhatsApp normal** — digite o código para confirmar.
   - ⚠️ Isso **não** mexe no seu WhatsApp; você só está se cadastrando como destinatário de teste.
4. Ainda nessa tela, clique no botão **Enviar mensagem** (Send message).
   - Seu celular deve receber uma mensagem de teste ("Hello World") **do número de teste da Meta**.

> ✅ Se a mensagem chegou, o lado da Meta está funcionando. Agora é só conectar ao CRM.

---

## Parte 4 — Publicar o CRM com as variáveis (deploy na Vercel)

O webhook precisa de um endereço público na internet. O CRM já roda na **Vercel**, então
vamos usar isso. (A rota nova `/api/whatsapp/webhook` não altera nenhuma tela existente —
é segura de publicar; só responde a admins cadastrados.)

1. Acesse **https://vercel.com** e abra o projeto **fam-crm**.
2. Vá em **Settings → Environment Variables**.
3. Adicione as **5 variáveis** (nome exatamente como abaixo). Marque o ambiente **Production**:

   | Name | Value |
   |---|---|
   | `WHATSAPP_PHONE_NUMBER_ID` | (o que você anotou) |
   | `WHATSAPP_TOKEN` | (o que você anotou) |
   | `WHATSAPP_APP_SECRET` | (o que você anotou) |
   | `WHATSAPP_VERIFY_TOKEN` | `fam-crm-verify-2026` (o seu) |
   | `WHATSAPP_BANNER_URL` | `https://SEU-APP.vercel.app/whatsapp/banner-fam.png` |

   > Troque `SEU-APP.vercel.app` pelo domínio real do seu projeto (vê em **Settings → Domains**).

4. Faça o **deploy** com o código novo:
   - Se você usa Git: dê `git push` da branch com estes arquivos novos. A Vercel publica sozinha.
   - Ou na Vercel: **Deployments → ... → Redeploy**.
5. Quando terminar, seu endereço do webhook será:
   **`https://SEU-APP.vercel.app/api/whatsapp/webhook`**

> Anote `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_BANNER_URL` — são os 2 valores que faltavam.

---

## Parte 5 — Conectar o webhook na Meta

1. Na Meta, vá em **WhatsApp → Configuração** (Configuration).
2. No bloco **Webhook**, clique **Editar** (Edit):
   - **URL de retorno de chamada** (Callback URL):
     `https://SEU-APP.vercel.app/api/whatsapp/webhook`
   - **Token de verificação** (Verify token): `fam-crm-verify-2026` (exatamente igual ao da Vercel)
   - Clique **Verificar e salvar** (Verify and save).
   - ✅ Se aceitar, a comunicação está validada. (Se der erro, veja **Apêndice B**.)
3. Ainda no bloco Webhook, em **Campos do webhook** (Webhook fields), clique **Gerenciar**
   e **assine** (Subscribe) o campo **`messages`**. Esse é o único necessário.

---

## Parte 6 — Cadastrar seu telefone no CRM (como admin)

O webhook só responde a quem é **admin** e tem o telefone cadastrado.

1. Entre no CRM FAM com seu usuário (admin).
2. Vá em **Usuários**, edite o seu usuário e preencha o campo **Telefone** com o seu número
   (o mesmo que você cadastrou na Parte 3). Pode salvar no formato com máscara `(11) 99999-8888`
   — o sistema compara só os dígitos.
3. Garanta que seu **Perfil = admin** e **Status = ativo**.
4. (Banco) Rode uma única vez o arquivo `supabase-whatsapp.sql` no **Supabase → SQL Editor**
   (cria um índice e a tabela de votos futura). Sem isso funciona, mas o índice deixa mais rápido.

---

## Parte 7 — Teste de ponta a ponta 🎉

1. No seu celular, abra a conversa com o **número de teste da Meta** (o mesmo da Parte 3).
2. Envie **`FAM`**.
3. Você deve receber o **menu** com 3 botões: **Comitê**, **Aprovadas**, **Emitidas**.
4. Toque em um botão → recebe o **card com o banner FAM** e os **KPIs** daquele status
   (quantidade, LMG total com teto de 80M, prêmio total).
5. Confira se os números batem com a tela de **Operações** do CRM.

> Deu certo? Então a tecnologia está provada. A partir daqui é só **escalar** (Parte 8),
> aí sim com calma e podendo mostrar pro diretor já funcionando.

---

## Parte 8 — Quando der certo, como escalar (resumo)

Só faça isto **depois** do teste aprovado:

1. **Número dedicado da FAM**: um chip/linha **novo** da empresa (não o seu pessoal e que
   **não** esteja num WhatsApp comum). Esse vira o remetente oficial.
2. **Verificação do negócio** na Meta (Business Verification): aí entra o **contrato social**
   (CNPJ), dados da empresa e comprovante de endereço. Libera limites maiores e o nome verificado.
3. **Nome de exibição** "FAM Seguradora" enviado para aprovação da Meta.
4. **Token permanente** definitivo (Apêndice A) e variáveis atualizadas na Vercel.

Me chame quando chegar aqui que eu te guio.

---

## Apêndice A — Token permanente (opcional, para o teste durar mais de 24h)

O token da Parte 2 expira em 24h. Para um token que não expira:

1. Acesse **business.facebook.com → Configurações do negócio** (Business settings).
2. Em **Usuários → Usuários do sistema** (System users), crie um (papel **Admin**).
3. Clique **Adicionar ativos** (Add assets) → selecione seu **app** → permissão total.
4. Clique **Gerar novo token** (Generate new token) → escolha o app → marque as permissões
   **`whatsapp_business_messaging`** e **`whatsapp_business_management`** → gerar.
5. Copie o token e troque o valor de `WHATSAPP_TOKEN` na Vercel (e redeploy).

---

## Apêndice B — Se algo não funcionar

- **"Verify and save" falhou (Parte 5):**
  - Confirme que o deploy terminou e que `WHATSAPP_VERIFY_TOKEN` na Vercel é **idêntico**
    ao digitado na Meta.
  - Teste o endereço no navegador (deve aparecer a palavra `teste`):
    `https://SEU-APP.vercel.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=fam-crm-verify-2026&hub.challenge=teste`
- **Mandei "FAM" e não veio nada:**
  - Seu telefone está cadastrado no CRM, com **perfil admin** e **status ativo**? (Parte 6)
  - O número no CRM e o que você usa no WhatsApp são o mesmo? (comparamos pelos dígitos finais)
  - O campo **`messages`** foi assinado no webhook? (Parte 5, item 3)
- **Veio o menu, mas o botão não responde:**
  - O `WHATSAPP_TOKEN` pode ter expirado (24h) — gere um novo (Parte 2 ou Apêndice A).
- **O card vem sem o banner:**
  - Abra `WHATSAPP_BANNER_URL` no navegador; tem que carregar a imagem. Confirme o domínio.

---

### Mapa rápido: tela da Meta → variável

```
WhatsApp ▸ Configuração da API
  ├─ ID do número de telefone ........ WHATSAPP_PHONE_NUMBER_ID
  └─ Token de acesso temporário ...... WHATSAPP_TOKEN
Configurações do app ▸ Básico
  └─ Chave secreta do app ............ WHATSAPP_APP_SECRET
Você inventa .......................... WHATSAPP_VERIFY_TOKEN
Seu domínio Vercel + /whatsapp/... .... WHATSAPP_BANNER_URL
```
