# AxiMobius: o que falta fazer (passo a passo)

Para o Marco. Não precisa saber programar: é copiar, colar e clicar.

Data: 01/08/2026.

---

## Situação

| Tarefa | Quem faz | Status |
|---|---|---|
| Criar a API de leitura no CRM | Claude | ✅ feito e testado |
| Criar o histórico por gatilho no banco | Claude | ✅ feito |
| Criar o usuário de leitura `aximobius_ro` | Claude | ✅ criado, **sem senha** |
| Publicar o token na Vercel | Claude | ✅ feito |
| **Definir a senha do usuário de leitura** | **Marco** | ⬜ **falta (4 cliques)** |
| Publicar o CRM com a API no ar | Marco | ⬜ falta (1 clique) |
| Consumir os dados no AxiMobius | Claude da outra conta | ⬜ falta |

Eu não consegui definir a senha sozinho: o meu ambiente bloqueia, por segurança,
comandos que definem senha de banco de dados. Precisa ser você.

---

## Tarefa 1: definir a senha do usuário de leitura

**Por que existe:** o `aximobius_ro` é um usuário do banco que só consegue LER.
Ele já está criado e já tem todas as permissões certas, mas está sem senha, então
ainda não consegue entrar. É proposital: assim a senha nunca passou por uma conversa.

### Passo 1
Abra o arquivo `.env.aximobius.local` na pasta do CRM
(`C:\Users\MarcoDragoneFAMSEGUR\fam-crm`).

Abra com o Bloco de Notas. Procure a linha `FAM_CRM_PG_PASSWORD=` e **copie o que
vem depois do sinal de igual**. É a senha que eu já gerei para você.

> Esse arquivo é invisível para o Git: ele nunca vai parar no GitHub nem na Vercel.

### Passo 2
Entre no Supabase: **https://supabase.com/dashboard**

Escolha o projeto do CRM (`xungscboxfkegbyhrnmc`).

### Passo 3
No menu da esquerda, clique em **SQL Editor** (ícone de banco de dados).
Depois clique em **New query**.

### Passo 4
Cole o comando abaixo, **trocando `COLE_A_SENHA_AQUI` pela senha que você copiou
no Passo 1** (mantenha as aspas):

```sql
alter role aximobius_ro with login password 'COLE_A_SENHA_AQUI';
```

Clique em **Run** (ou aperte Ctrl+Enter).

Deve aparecer `Success. No rows returned`. Pronto, acabou.

### Como conferir que deu certo
Cole isto no mesmo SQL Editor e clique em Run:

```sql
select rolname as usuario,
       rolcanlogin as consegue_entrar,
       rolsuper as e_administrador,
       rolbypassrls as ignora_seguranca
from pg_roles where rolname = 'aximobius_ro';
```

O resultado tem que ser:

| usuario | consegue_entrar | e_administrador | ignora_seguranca |
|---|---|---|---|
| aximobius_ro | **true** | false | false |

`consegue_entrar = true` significa que a senha funcionou.
`e_administrador = false` e `ignora_seguranca = false` confirmam que ele continua
sendo um usuário limitado, que só lê.

---

## Tarefa 2: publicar o CRM

A API só passa a existir no ar depois de um novo deploy. O token já está configurado
na Vercel, então basta publicar.

**Opção A (mais simples):** faça o commit e o push das mudanças como você já faz
normalmente. A Vercel publica sozinha.

**Opção B:** no painel da Vercel (**https://vercel.com**), abra o projeto `fam-crm`,
aba **Deployments**, e clique em **Redeploy** no deploy mais recente.

### Como conferir que a API subiu

Abra este endereço no navegador:

```
https://fam-crm-five.vercel.app/api/axi/schema
```

Deve aparecer uma mensagem de erro em português:

```json
{"ok":false,"erro":"Envie o header Authorization: Bearer <token>."}
```

**Esse erro é o resultado certo.** Ele prova duas coisas: a API está no ar, e ela
está protegida (ninguém lê nada sem o token). Se aparecer a tela de login do CRM
ou um erro 404, o deploy ainda não terminou.

---

## Tarefa 3: entregar para o Claude do AxiMobius

Quando for configurar o outro sistema, dê ao Claude Code de lá:

1. **O documento técnico:** `docs/AXIMOBIUS-INTEGRACAO.md` (está nesta mesma pasta).
   Tem tudo: endereços, formato dos dados, código pronto e as armadilhas do negócio.

2. **As credenciais:** o conteúdo do arquivo `.env.aximobius.local`.

Uma frase que basta dizer a ele:

> Leia o documento `AXIMOBIUS-INTEGRACAO.md` e implemente a sincronização com o CRM
> da FAM. Use as credenciais do arquivo `.env`. Lembre: o AxiMobius só LÊ o CRM,
> nunca escreve nada nele.

---

## Segurança: o que fazer se algo der errado

**Se você quiser cortar o acesso do AxiMobius ao banco**, na hora, sem discussão:

```sql
alter role aximobius_ro with nologin;
```

**Se quiser cortar o acesso à API**, apague a variável `AXI_API_TOKEN` no painel da
Vercel (Settings → Environment Variables) e publique de novo.

**Se a senha vazar**, troque com o mesmo comando da Tarefa 1, usando outra senha.

Em nenhum dos casos o CRM para de funcionar: essas credenciais só servem para o
AxiMobius ler.

---

## Uma garantia que vale repetir

O AxiMobius **não consegue** alterar, inserir ou apagar nada no CRM. Não é uma
promessa, é uma impossibilidade técnica em três camadas:

1. A API só tem endereços de leitura. Qualquer tentativa de escrita responde "método
   não permitido" (testado: 16 tentativas, todas bloqueadas).
2. O usuário `aximobius_ro` tem permissão de leitura e **nenhuma** de escrita
   (conferido: zero permissões de escrita no banco inteiro).
3. As regras de segurança do banco criadas para ele são exclusivamente de leitura.

Se o AxiMobius identificar que algum dado do CRM está errado, ele avisa. A correção
é sempre feita por uma pessoa, dentro do CRM.
