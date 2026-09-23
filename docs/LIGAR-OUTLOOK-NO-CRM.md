# Arrastar o e-mail do Outlook para dentro do CRM

**O que isto resolve.** Hoje, para um pedido virar caso, alguém salva o e-mail e
sobe o arquivo. Com isto ligado, basta **arrastar o e-mail do Outlook para a
área de soltura do CRM**: o sistema busca o e-mail inteiro no Microsoft 365,
com anexos, abre o caso e cria o card na coluna Entrada da Análise.

---

## Por que precisa de configuração

O **Outlook clássico** entrega o arquivo do e-mail direto para o navegador, e
nesse caso o CRM já funciona sem nada disto.

O **Novo Outlook** não entrega — e não vai entregar: é decisão da Microsoft. O
que ele entrega, ao arrastar, é um bilhete com o **identificador** da mensagem e
a caixa de onde ela saiu. Descobrimos isso arrastando um e-mail de verdade em
23/09/2026; o formato não tem documentação pública.

Com o identificador, o Microsoft Graph devolve o e-mail completo — mas só para
quem tem permissão. É essa permissão que se configura aqui, **uma vez**.

---

## O jeito fácil: duplo clique

Na pasta do CRM, abra **`LIGAR OUTLOOK.cmd`**.

Ele pede **um login da Microsoft** (um código de seis letras, no navegador) e faz
sozinho tudo o que está descrito abaixo: registra o aplicativo, cria o segredo,
pede as permissões, tenta conceder o consentimento da empresa e escreve as quatro
variáveis no `.env.local`. No fim, gera um `COLAR-NA-VERCEL.txt` para a equipe
que usa o CRM publicado.

Nenhum e-mail é lido nesse processo: ele só cria a permissão.

Funciona sem instalar nada: fala com a Microsoft pelo mesmo caminho do `az login`.
Se a FAM não permitir que a sua conta registre aplicativos, ele para e diz isso;
aí o caminho é o manual, abaixo, com quem administra o Microsoft 365.

### E os colegas?

**Não fazem nada disso, e nada é instalado na máquina deles.** Isto é uma vez só,
por você. Eles entram no CRM pelo navegador, vão em Comercial > Entrada de pedidos,
arrastam o e-mail e clicam uma vez em **"Ligar minha caixa do Outlook"**.
Se o consentimento da empresa tiver sido concedido, nem essa tela eles veem.

---

## O jeito manual (se o automático não puder rodar)

## Passo 1 · Registrar o CRM no Entra ID (só o admin do Microsoft 365)

1. Abra <https://entra.microsoft.com> → **Identidade** → **Aplicativos** →
   **Registros de aplicativo** → **Novo registro**.
2. Preencha:
   - **Nome**: `FAM CRM`
   - **Tipos de conta**: *Somente contas neste diretório organizacional*
     (a FAM, inquilino único)
   - **URI de redirecionamento**: tipo **Web**, valor
     `https://fam-crm-five.vercel.app/api/ms/callback`
3. **Registrar**.
4. Na tela do aplicativo, em **Autenticação** → **Adicionar URI**, acrescente
   também `http://localhost:3000/api/ms/callback` (é o CRM rodando na sua
   máquina; sem ele, só funciona no site publicado).
5. Anote, da página **Visão geral**:
   - **ID do aplicativo (cliente)** → vira `MS_CLIENT_ID`
   - **ID do diretório (locatário)** → vira `MS_TENANT_ID`
6. **Certificados e segredos** → **Novo segredo do cliente** → validade de 24
   meses → copie o **Valor** (não o ID). Ele **só aparece uma vez** → vira
   `MS_CLIENT_SECRET`.
7. **Permissões de API** → **Adicionar uma permissão** → **Microsoft Graph** →
   **Permissões delegadas** → marque:
   - `Mail.Read` — ler o e-mail **de quem clicar**, e nada mais
   - `User.Read` — saber de quem é a caixa que foi ligada
   - `offline_access` — manter a permissão sem pedir login todo dia
8. Se aparecer o botão **Conceder consentimento do administrador**, clique.
   Sem isso, cada pessoa consegue autorizar sozinha **se** o inquilino permitir;
   com a FAM restringindo consentimento de usuário, ninguém consegue ligar a
   caixa até o admin conceder.

> **Permissão delegada, nunca de aplicativo.** `Mail.Read` *delegada* significa
> "o CRM lê o e-mail da pessoa que autorizou". A versão *de aplicativo* leria a
> caixa de qualquer um na FAM, sem ninguém autorizar. O CRM não pede essa, e não
> deve pedir: seria a porta dos fundos que a varredura de segurança de 22/09
> fechou em outro canto.

---

## Passo 2 · Colocar as quatro variáveis

No `.env.local` (máquina) **e** em *Settings → Environment Variables* do projeto
na Vercel (site publicado):

```
MS_TENANT_ID=<ID do diretório (locatário)>
MS_CLIENT_ID=<ID do aplicativo (cliente)>
MS_CLIENT_SECRET=<o Valor do segredo>
MS_TOKEN_KEY=<uma chave só sua, ver abaixo>
```

A `MS_TOKEN_KEY` cifra, no banco, a permissão guardada de cada pessoa. Gere uma
assim e cole o resultado:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Se ela faltar, o CRM usa o próprio `MS_CLIENT_SECRET` como base — funciona, mas
trocar o segredo passaria a invalidar as conexões de todo mundo.

Depois: **REINICIAR CRM.cmd** na máquina, e um novo *deploy* na Vercel.

---

## Passo 3 · Cada pessoa liga a própria caixa

Na tela **Comercial → Entrada de pedidos**, ao arrastar o primeiro e-mail
aparece o convite **"Ligar minha caixa do Outlook"**. Um clique, a Microsoft
pergunta se autoriza, e pronto — não se repete.

Daí em diante: arrastou, virou caso.

---

## O que fica guardado, e onde

| O quê | Onde | Por quanto tempo |
|---|---|---|
| A permissão duradoura (*refresh token*), **cifrada** | tabela `ms_conexoes` | até a pessoa desligar |
| O token de acesso (vale 1 hora) | em lugar nenhum | é pedido a cada busca |
| O e-mail em si | como sempre: caso, anexos e documentos do CRM | — |

A tabela `ms_conexoes` **não tem policy de leitura**: nenhuma sessão de
navegador chega nela, nem a do dono da linha. Só o servidor, nas rotas
`/api/ms/*`.

Para desligar: o CRM esquece a permissão pelo próprio botão; para revogar do
lado da Microsoft, <https://myapplications.microsoft.com> → FAM CRM → remover.

---

## Quando não funciona (e o que fazer)

| Situação | O que acontece | Saída |
|---|---|---|
| E-mail de **caixa compartilhada** aberta no seu Outlook | o CRM recusa: a caixa do e-mail não é a que você ligou | salvar o e-mail e soltar o arquivo |
| E-mail **movido ou apagado** depois do arrasto | "não achei este e-mail na sua caixa" | reencaminhar ou salvar o arquivo |
| E-mail acima de **50 MB** | recusado antes de baixar | salvar e subir os documentos direto no caso |
| `MS_*` não configurado | a tela diz exatamente qual variável falta | este documento |

---

## Para conferir sem depender do Outlook

```
npm run arrasto:test     # lê o bilhete real do Novo Outlook (fixture de 23/09/2026)
npm run porteiro:test    # o que é e-mail e o que não é, contra o acervo real
node scripts/ensaio-entrada-pedidos.mjs   # as telas e as rotas, no navegador
```
