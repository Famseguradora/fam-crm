# 🏛 Julgamento do Comitê — guia da funcionalidade (SIMULADOR)

> ⚠️ **Escopo:** implementado **somente no simulador** (branch `sandbox`).
> Banco de dados = planilha `public/sandbox-dados.xlsx` + localStorage do navegador.
> **Não usa Supabase real e não altera nada do CRM oficial.**

## O que é

Quando uma operação vai para o status **"Comitê"**, ela entra num "julgamento" colegiado
(estética de plenário/STF): o subscritor registra seu **parecer + voto**, os **diretores
votam**, e há um **placar ao vivo** com o **parecer final**. Há ainda um **Simulador de
WhatsApp** que reproduz o convite e a votação remota dos diretores pelo celular.

## Fluxo completo

1. **Crédito** cadastra o tomador e anexa a análise (já existia).
2. **Subscrição** insere a operação (já existia).
3. Qualquer pessoa muda o **status para "Comitê"** (não bloqueia). O que aparece depois
   depende do **cargo de quem mudou** (definido na tela Usuários):
   - **É subscritor** (cargo contém "subscri": Subscritor, Coordenador/Diretor de
     Subscrição) → modal **"Deseja Registrar seu Voto?"**. *Sim* abre a Deliberação para ele
     votar primeiro; *Não* mantém em Comitê e ele vota depois (sem travar).
   - **Não é subscritor** → **lembrete aos subscritores** ("há nova operação para votar"),
     com a opção de já abrir a Deliberação.
4. A operação aparece na aba **🏛 Comitê**, já aberta na sub-aba **⚖️ Deliberação**:
   - **Parecer da Subscrição** (editável aqui também).
   - **A Bancada**: cada diretor com seu estado (pendente / voto proferido), com a tag
     "⚖️ Acompanha o Subscritor" quando for o caso, e a argumentação.
   - **Proferir Voto**: escolhe o diretor + uma opção — os 3 votos ou **"🤝 Acompanho o
     Subscritor"** (herda o voto do subscritor) — + argumentação.
   - **Placar ao Vivo**: barras + contadores. Quando todos votam → **banner de Parecer
     Final** + micro-celebração + sugestão de próximo passo.
5. Cada voto **aparece na tela de todos** em tempo real (no sandbox: mesma aba e entre abas
   do mesmo navegador).

## WhatsApp (simulado)

Botão **"📱 Abrir Simulador WhatsApp"** abre um **mockup de celular** com a conversa de cada
diretor que tem celular cadastrado e a flag de comitê:

- Mensagem personalizada: *"Olá, Sr(a). Sérgio Macedo 👋 — O Subscritor Ivan Lima acabou de
  te convidar a conhecer uma operação que entrou em Comitê..."* com Tomador, modalidade,
  Prêmio, LMG, Taxa e Prazo.
- Botões **📄 Ver análise de crédito** e **🗳️ Votar** (vota pelo próprio "WhatsApp").
- Ao votar, o bot responde com confirmação + placar; quando a bancada fecha, manda a
  mensagem de veredito.
- Selo **"SIMULAÇÃO — nenhuma mensagem real é enviada"**. Nada sai para a Meta/WhatsApp real.

## Autorização dos diretores

Na tela **Usuários**, cada usuário tem a flag **"🏛 Membro do Comitê"** (coluna com botão de
liga/desliga + checkbox no formulário de edição). Só membros com a flag **e ativos** votam;
com celular cadastrado, recebem o convite no simulador de WhatsApp.

## Como testar

1. No topo, faixa **🧪 Sandbox → Resetar** (recarrega os dados novos da planilha).
2. **Operação já pronta:** a op-2 (Engenharia Vale Verde) já vem em Comitê com o parecer do
   subscritor e 1 voto (Sérgio Macedo). Abra a aba 🏛 Comitê → ⚖️ Julgamento e vote pelos
   demais diretores até fechar o placar.
3. **Fluxo do zero:** pegue a op-1 (Construtora Horizonte), mude o status para **Comitê**,
   informe o parecer, envie ao Comitê e teste o simulador de WhatsApp.

## Arquitetura (resumo técnico)

- `lib/comite/votacao.ts` — lógica pura (placar, parecer final, "acompanho o subscritor").
- `lib/comite/realtime.ts` — barramento de eventos "tempo real" do sandbox (CustomEvent +
  `storage`).
- `lib/comite/whatsapp-sim.ts` — geração das mensagens do WhatsApp.
- `components/comite/{ComiteEntradaModal,PainelJulgamento,WhatsAppSimulator}.tsx` —
  componentes **puramente presentacionais** (recebem dados + callbacks; sem IO). A aba se
  chama **Deliberação**; o `PainelJulgamento` tem **tema escuro premium** (sala de comitê),
  com **chuvinha de confete a cada voto**, glow nos cards votados, modal de histórico/linha
  do tempo e o **Selo do Comitê** (emblema que "carimba" o veredito — APROVADA/REPROVADA —
  ao fechar a votação).
- `app/(dashboard)/operacoes/page.tsx` — loaders, handlers (voto/parecer) e a aba
  ⚖️ Julgamento no cockpit do Comitê. Toda persistência passa pelo `createClient()` que, no
  sandbox, é o mock do Excel.
- `types/index.ts` — `Usuario.comite`, campos de `Operacao` (parecer/voto/whatsapp/parecer
  final) e `ComiteVoto` estendido.
- Dados: `scripts/gen-sandbox-xlsx.mjs` (regerar com `npm run sandbox:gen`) → aba
  `comite_votos`, diretores com flag e telefone, status alinhados (`Comitê`/`Aprovado`/
  `Emitido`).

## Para levar a produção (futuro)

A tabela `comite_votos` já existe em `supabase-whatsapp.sql` (estrutura). Para produção real
seria preciso: aplicar a migração com `UNIQUE(operacao_id, usuario_id)`, adicionar as colunas
de parecer em `operacoes` e a coluna `comite` em `usuarios`, e ligar a Cloud API da Meta no
webhook já existente (`app/api/whatsapp/webhook`). **Nada disso foi feito — é só simulador.**
