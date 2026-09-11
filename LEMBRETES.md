# LEMBRETES

Esta lista aparece sozinha no começo de toda sessão do Claude Code.
Pode editar à mão. Item entregue **sai da lista**, não fica marcado acumulando.

## EM ANDAMENTO: a IA Gestor em todo o CRM, e o funil reformado (09/09/2026)

**As duas migrations já foram aplicadas** em 09/09/2026 (`ia-servidor` e `funil-wip`).
O código também ficou à prova de migration atrasada: coluna nova que não existe faz a tela
seguir sem ela, e não derrubar tudo (foi assim que o `wip_limite does not exist` matou as
colunas do Kanban).

**Só falta uma coisa sua para a IA funcionar:**

- [ ] **Colocar a `ANTHROPIC_API_KEY` no `.env.local`** e reiniciar o CRM (duplo clique em
      `REINICIAR CRM.cmd`). Sem ela o interruptor recusa ligar de propósito (ligado sem chave
      seria um botão mentindo). Depois é só ligar no painel (Ctrl+I).
- [ ] **Ligar a API**: o interruptor está dentro do painel da IA (Ctrl+I em qualquer tela), só
      aparece para você, e mostra o gasto das últimas 24 h ao lado. Teto do dia começa em US$ 5.
- [x] **Modelo decidido: Sonnet 5.** Opus 5 fica reservado para os motores de análise de
      crédito e de subscrição, que ainda vamos fazer. Já é o padrão da migration.
- [ ] **O histórico da IA é por conversa e por pessoa.** O ☰ no painel lista as SUAS conversas;
      ninguém lê a do outro, nem você (é RLS no banco, não escolha de tela). Reabrir uma
      conversa traz os gráficos junto, não só o texto.
- [x] **Tetos de fila do funil já definidos**: Para Analisar 20, Em Análise 12, Comitê 6.
      As de fim de linha (Aprovado, Emitido, Perdido, Recusado) ficaram sem teto de propósito:
      ali a fila não é gargalo, é histórico. Ajuste em `status_fluxo_operacao.wip_limite`.

## RESOLVIDO em 09/09/2026: o "Trazer para a esteira" que não trazia

O e-mail ficava em `a_trazer` para sempre e o erro chegava **vazio** na tela. Eram duas coisas:

1. **O Carteiro não estava rodando** nesta máquina (o CRM e a Esteira estavam).
2. **O Next corta o corpo da requisição em 10 MB** quando existe um `proxy.ts`, e o e-mail da
   RIALMA tem 16,5 MB. O corte é silencioso: o `formData()` estourava com "expected boundary
   after body" e a rota respondia 500 sem nunca ter visto o arquivo.

Consertado com `experimental.proxyClientMaxBodySize: '50mb'` no `next.config.ts`, que agora
casa com o `MAX_BYTES_EMAIL` da rota e com o teto do bucket. **Precisa de restart do servidor
para valer.** Caso #14 (RIALMA) entrou com 3 documentos.

- [ ] **Deixe o `agentes.vbs` rodando no logon** se quiser o Carteiro sempre de pé. Ele agora
      não derruba quem já está rodando: sobe só o que falta.
- [ ] **Testar de ponta a ponta ainda depende de você**: os dados são reais e o teste gastaria
      dinheiro de verdade na API.

## EM ANDAMENTO: tirar as telas abertas, e o primeiro passo simples (09/09/2026)

**Feito hoje, e já no localhost:3000** (não commitado, não publicado):

- O funil (`/fluxo`) ganhou a **primeira coluna, "Triagem / Cadastro"**, com os casos ainda não
  concluídos e o botão **＋ Novo pelo CNPJ** (abre cadastro sem e-mail nenhum).
- A tela do caso virou **três passos numerados**: 1 A empresa · 2 Os documentos · 3 Para a
  análise. O **cadastro do tomador nasce no passo 1** (CNPJ → Receita), e não mais no fim: dá
  para pré-cadastrar e ir embora. Nada disso precisa de agente nem de máquina ligada.
- **Documento entra pela tela** (arrasta e solta), inclusive o Serasa que chega depois. Escolhe
  o tipo antes de soltar, e a exigência do checklist cai sozinha.
- `agentes.vbs` sobe **Carteiro e Esteira sem janela** (log em `agentes.log`);
  `PARAR AGENTES.cmd` desliga. **É curativo, não solução.**

**Falta decidir (é o que tira as telas de verdade):**

- [ ] **Outlook + Carteiro → Microsoft Graph.** Registrar o app no Entra ID da FAM, ler a caixa
      pelo servidor. Aí o Outlook não precisa estar aberto, e o Carteiro deixa de existir.
      Depende de alguém com admin no tenant.
- [ ] **Esteira → API da Anthropic no servidor.** O `@anthropic-ai/sdk` já é dependência do CRM.
      Hoje o motor usa o `claude.exe` da assinatura (custo zero); pela API passa a ter custo por
      análise. É uma decisão de dinheiro, não de código.
- [ ] Com os dois de pé, a Vercel deixa de depender do notebook e o localhost vira só o ambiente
      de trabalho dele.
- [ ] **Testar de ponta a ponta ainda não dá para eu fazer**: os dados são reais, e o teste
      criaria tomador de verdade. Precisa do clique dele num caso real.

## EM ANDAMENTO: a Mesa da análise dentro do CRM (09/09/2026)

O cockpit do Sistema de Análise foi portado INTEIRO para `/analises`: a barra (Mesa · Recados ·
Gestão · Sala de Comando · A Equipe · Alçadas · Caixa de entrada · Sistema local), a Mesa com os
5 números e os três olhares, e **clicar num tomador abre o card dele** (`/analises/mesa/<id>`)
com as 7 abas do cockpit: Visão geral, Arquivos, Análise, Relatório, IA, Encaminhar, Atividades.
O CRM continua sem ler 127.0.0.1: quem leva tudo é o agente do notebook.

A migration (`supabase-migration-analise-mesa.sql`) **já foi aplicada** em 09/09/2026, e a
primeira volta do agente já encheu a Mesa: 123 recados, 13 alçadas com 5 pedidos esperando você,
as 2 pastas com triagem, arquivos e linha do tempo.

- [ ] **Deixar o `ESTEIRA.cmd` aberto no dia a dia** (duplo clique na raiz do projeto, irmão do
      CARTEIRO.cmd). É ele que mantém a Mesa viva: manda os arquivos, a triagem, a linha de
      processos, o mural e as alçadas, e executa as ordens dadas no CRM. Com o `Analisar.cmd`
      também de pé, "Analisar agora" no CRM é o mesmo clique do cockpit; sem ele, o agente
      entrega o comando `/analise <pasta>` na própria janela.
- [ ] **O push ainda não saiu** (você pediu para deixar o deploy para depois): o trabalho está
      commitado só nesta máquina, e a Vercel continua no código de 08/09.
- [ ] O que ficou no **Sistema local** de propósito: "Sua performance" e "Análise prévia" da
      Gestão, "Escolher pasta", "Configurações" e "Tema claro" (gestos da máquina dele).
- [ ] **A esteira só enxerga pasta na raiz.** As 2 que estão lá aparecem; as concluídas saem
      para `_concluidas` e a Mesa não as mostra (o Acervo mostra). Se quiser as antigas na
      Mesa, é decisão sua e é uma linha no agente.

## EM ANDAMENTO: o Mapa do Sistema (04/09/2026)

O desenho do fluxo novo (e-mail → IA classifica → **um card por empresa** → Comercial, Cadastro,
Crédito, Subscrição, Jurídico) virou duas páginas publicadas. **Para continuar em outra conversa,
basta abrir a sessão nesta pasta e dizer "continuar o mapa do sistema".**

- **Mapa do Sistema FAM** (canvas vivo, os diretores editam, arrastam, criam card e ligação):
  https://claude.ai/code/artifact/35855973-b1bb-4b72-9787-7e21db1caa15
- **Fluxo Operacional FAM** (fluxograma de leitura, para apresentar):
  https://claude.ai/code/artifact/516cfb1a-229e-4b3a-9d30-4dbd21c6e0b4
- **Protótipo do CRM FAM** (o sistema navegável, botões funcionando, sem banco):
  https://claude.ai/code/artifact/7c5b47e5-9bad-4a56-ba5d-72825d927310
  Fonte no projeto: `prototipo/prototipo-crm-fam.html` (partes p1..p8 no scratchpad da sessão).

O conteúdo (19 áreas, 136 cards, 23 ligações) mora no banco do próprio artefato, não no HTML —
republicar a página não apaga nada. Para o Claude editar a página a partir de outra conversa, ele
precisa receber a URL acima; sem ela, cria um artefato novo em vez de atualizar este.

- [ ] **Levar as decisões do mapa para o LEMBRETES/plano**: o mapa tem uma área "17 · Decisões
      pendentes (diretoria)" com 8 perguntas que travam o desenho (card morto entra na esteira
      inteira? régua nova vale retroativo? quem decide a mitigação da Subscrição? etc.).
- [ ] **Mandar o mapa para os diretores** e recolher o que cada área acrescentar.

## O que vai ser feito no CRM (ordem redefinida por ele em 30/08/2026)

Tudo converge para o CRM. Ele deixa de ser o cadastro e vira a casa de tudo, inclusive dos robôs.

- [ ] 1. **Análise de crédito** dentro do CRM. As 146 análises, 292 exercícios e 443 conflitos
      estão no banco, e a ficha lê do Supabase.

      **Feito em 08/09/2026 — a análise deixou de depender do 127.0.0.1 para ser LIDA:**
      - **Acervo** em `/analises/acervo`: as 146, com busca por empresa, CNPJ, corretora e grupo.
        Era a única lista que só existia no sistema separado.
      - **Relatório nativo** em `/analises/<id>`: a análise inteira, seção por seção (a análise,
        os 3 C's, Serasa, grupo e organograma, demonstrações, documentos), lendo o Supabase.
        Funciona no CRM publicado, em outro computador e no celular.
      - **Os 3 C's ganharam tela** — o fundamento de Caráter, Capacidade e Capital estava no banco
        desde 30/08 e nunca tinha sido desenhado em lugar nenhum do CRM.
      - **`analises.tomador_id` preenchido**: estava NULO nas 146; 121 foram ligadas por CNPJ
        (as outras 25 são 20 sem tomador no CRM e 5 sem CNPJ apurado).
      - As seções são **fonte única** (`components/analise/Relatorio.tsx`): a Mesa do Tomador e o
        relatório desenham do mesmo arquivo. Conferido por `npm run acervo:ensaio` (22 asserções
        no navegador, contra o banco real, sem escrever nada).

      **Falta**: o saneamento dos 212 tomadores sem CNPJ (de 558), o índice de documentos
      (`analise_documentos` continua ZERADA nas 146, o dado está nos `_status.json` do disco), e a
      publicação automática — **nada roda `npm run publicar` por horário**, então análise editada
      hoje só aparece no CRM depois que alguém publicar. A tela de Conferência já existe
      (Tomadores › Conferência).
- [x] 2. ~~Financeiro~~ — **feito**, palavra dele em 30/08.
- [ ] 3. **Cadastro do tomador** — a tela única, forte, executiva. É a joia.
      **A Mesa do Tomador já existe**, em `/tomadores/<id>`, no layout que ele desenhou.
      Falta: publicar (a análise completar o cadastro ao salvar), Serasa, e os campos criados
      por ele estilo Pipefy.
- [ ] 4. **IAs e Robôs dentro do CRM** (era o 5)
- [ ] 5. **Múltiplos agentes, Organograma, e os agentes VISÍVEIS atuando nas telas** — "o principal"
- [ ] 6. **Dashboard inicial e o calendário**, que ele mandou fazer **junto com os agentes
      visíveis, os dois no fim**. Não começar antes.

Regra que vale para todas: **nada de CRM sem o Marco presente.** Código, migration e commit só com
ele junto.

## A Biblioteca do tomador, feita em 01/09/2026 (no `_sistema`, não no CRM)

A aba **Arquivos** do card estava vazia para quase todo tomador: ela varria só `RAIZ/<pasta>`, e
pasta na raiz só existe enquanto a análise não terminou. Agora ela procura em `_concluidas`, e a
**triagem grava um retrato** da lista pela chave do tomador (`registro/biblioteca/<chave>.json`),
que sobrevive à pasta sair do disco. Peça nova: `_sistema/biblioteca.mjs`.

Junto veio o **bibliotecário**: um agente que lê TODOS os documentos da pasta (inclusive os que
ficam fora da análise de crédito) e escreve o retrato da empresa, os sócios, o grupo econômico, o
resumo de cada documento e as ligações entre eles. Roda sozinho ao concluir a análise, em segundo
plano, e pelo botão **ler a pasta** na aba. Desligar o automático: `FAM_BIBLIOTECA_AUTO=0`.

- [ ] **Rodar a leitura no acervo já analisado.** Só a Soltec Brasil foi lida (412s, 19 arquivos).
      As outras 138 análises só ganham o bloco quando alguém clicar em "ler a pasta", ou quando a
      análise for refeita. Decidir com ele se vale uma passada em lote e quanto custa.
- [ ] **Levar isto para a Mesa do CRM.** A gaveta Documentos de `/tomadores/<id>` continua vazia
      pelo mesmo motivo de sempre (`analise_documentos` ZERADA no Supabase). O dado agora existe
      pronto e por CNPJ nos retratos; falta a carga. **Não foi feito: é CRM, e é decisão dele.**

## O que ele mandou gravar, e agora está gravado (29/08/2026)

Nenhum destes se perde mais: cada um virou arquivo de memória, e não só conversa.

- [ ] **Robô estatístico e de dados**, na máquina dele: desvio padrão, variância, risco,
      regressão linear "e mais". Gráficos e **tabelas customizadas montadas por ele**, tudo
      dentro do sistema. Estatística escrita em casa, com memória de cálculo ao lado do número.
      A **API do Claude entra só no fim** de todo o trabalho, palavra dele.
- [ ] **Calendário** (é o item 4 acima, visto pelo lado do Pipefy) e **notificação** quando vence.
- [ ] **Mensagens internas** dentro do card / tomador, estilo Pipefy. Nunca foi começado, e até
      hoje não existia registro nenhum disso. Não confundir com o mural dos agentes nem com os
      comentários que o Supabase já tem.
- [ ] **SLA por fase** visível como no print do Pipefy: contador, cor e motivo. Existe pela metade
      (a Mesa já fica vermelha quando estoura).
- [ ] **Serasa pelo navegador, sem API.** A conversa original **não está nesta máquina**: foram
      varridos os 374 MB de transcripts e não há nada. Foi no claude.ai web, cuja sincronização
      está desligada de propósito. O desenho precisa ser refeito com ele: qual portal, se roda
      sozinho ou sob comando, e se só baixa o PDF ou já grava os campos.
- [ ] **Supabase mensal + backup** — ele contrata quando o trabalho todo fechar.
- [x] **Baixar HTML** — pedido em 30/08: a análise deixa de morar em JSON, mas o botão de baixar
      HTML **fica**, porque ele manda o arquivo para a equipe. Já está feito na Mesa: um arquivo
      só, com tudo aberto, sem script nenhum dentro.

## Acesso, decidido em 30/08/2026

A análise de crédito tem **um analista só**. Todo mundo vê (ele quer a equipe
acompanhando o trabalho acontecer, e a Conferência atualiza ao vivo); ninguém
além dele edita. A marca é `usuarios.analista_credito`, e a trava é a RLS
`fam_e_analista()` — não é `perfil`, os 7 admins não passam.

- [ ] **Liberar as tais "algumas pessoas"** quando ele decidir quem. Não precisa de
      código nem de migration, é uma linha:
      `update usuarios set analista_credito = true where email = '…';`
- [ ] **PERGUNTA PARA O MARCO, levantada em 08/09/2026 ao abrir o Acervo.** A RLS de
      `analises`, `analise_exercicios` e `analise_documentos` é `select to authenticated
      using (true)` desde a migration de 30/08 — **isso não mudou**, e é a decisão "todo
      mundo vê" acima. O que mudou foi a FACILIDADE: antes, quem tinha perfil `leitura`
      só topava com uma análise navegando tomador por tomador; agora `/analises/acervo`
      põe as 146 numa lista buscável, Serasa, PEFIN, protestos, balanços e 3 C's
      incluídos. E existem contas `leitura` **de fora da FAM** no banco:
      `marcelo@bulhoesadvogados.com` e `marcelo.fonseca@stonepart.com`.
      **É para eles verem o dossiê de crédito de qualquer cliente?** Se não for, a
      correção é uma policy de SELECT por perfil nessas três tabelas — não é mexer nas
      telas novas, porque o dado já estava alcançável antes delas.
- [ ] **Trocar a url do `_crm.json` no dia do deploy.** O motor avisa o CRM que uma
      análise começou (aviso no canto inferior direito, para a equipe toda). Hoje aponta
      para `http://localhost:3000`, que é o único endereço que existe. O arquivo está em
      `_sistema/estado/_crm.json` e o segredo dele tem que continuar igual ao
      `ANALISE_EVENTO_TOKEN` do `.env.local`. Sem isso o aviso simplesmente não sai, e
      a análise roda igual (de propósito: aviso nunca derruba análise).
      **Desde 01/09/2026 o mesmo cano leva o nome das corretoras** (`/api/analise/corretoras`):
      com a url errada, o de-para para de atualizar e os nomes ficam como a IA escreveu.
- [ ] **O pipeline de e-mail nasce trancado.** Hoje o e-mail dele não está exposto
      porque o servidor local só escuta em `127.0.0.1`. No dia em que o corpo do
      e-mail subir vetorizado para o Supabase, ele passa a morar num banco
      compartilhado: a tabela `emails` precisa nascer com RLS de dono, no mesmo
      movimento em que for criada. Não depois.

## Com data marcada

- [ ] **22/09/2026** — vence a primeira apólice (Usina Termelétrica de Lins, R$ 21.045.420). É o
      primeiro caso de devolução de limite. Até lá, ou a linha do tempo existe ou o limite
      comprometido passa a mentir. Hoje nenhuma das 24 emitidas venceu: a janela está limpa.

## Duas perguntas dele que estão em aberto

- [ ] Apólice **vencida** devolve o limite integralmente, ou fica parte retida por cauda?
      Enquanto não responder, o cálculo soma todas as emitidas (critério conservador).
- [ ] Qual a **periodicidade** que a política de crédito manda para cobrar demonstrativo financeiro?
      Por faixa de limite ou por rating? E a notificação chega no CRM, por e-mail, ou nos dois?

## Caixa de entrada (Carteiro), pendência de 30/08/2026 à noite

Commit `8a1a45e` no `_sistema` (outlook.ps1, outlook.mjs, servidor.mjs, cockpit/outlook.html)
e `dac2fc0` no fam-crm, ambos empurrados. A roda do mouse não descer o e-mail quando passada
sobre o CABEÇALHO (assunto/De/Para/anexos) é comportamento CORRETO, confirmado por ele em
31/08/2026 — não mexer, não é bug. Sobre o corpo do e-mail, rola normal.

- [ ] **O e-mail da EBSE mostra 19 imagens quebradas**: a ação `corpo` do `outlook.ps1` para em 12
      imagens `cid:` por e-mail, e esse tem 31. Fora do escopo daquela rodada, não foi mexido.

## Cinco corretoras que a análise usa e o CRM não tem (01/09/2026)

O de-para já casa 37 das 43 grafias do acervo com as 98 corretoras cadastradas. Estas cinco não
casam porque **não existem no cadastro**, e isso é decisão da mesa comercial, não do código:

- [ ] **Oneglobal** — é a corretora do Consórcio Construtor Petro UFN-III. Cadastrar ou apontar
      qual das 98 é ela.
- [ ] **BRNPar**
- [ ] **Itheraseg** — a **Ithera** existe no CRM. Se for a mesma, é só grafia colada e some
      sozinha quando a análise for corrigida.
- [ ] **WTW - Wllis** — erro de digitação de "Willis". A grafia certa já casa.
- [ ] **Gama Incorporadora Ltda** — não parece ser corretora; ver se o campo foi preenchido errado.

Depois de cadastrar qualquer uma: `node corretoras.mjs --forcar` no `_sistema`, ou
`POST http://127.0.0.1:7311/api/corretoras?forcar=1`.

## Dívida achada no banco, não é plano

- [ ] **Nova Tech Engenheiro** com o limite estourado: R$ 3.893.845,49 emitidos contra R$ 3.628.500,00
      aprovados. R$ 265.345,49 acima, e é anterior a qualquer alarme.
- [ ] **Fator Towers** em 98,1% do limite. Não estourou, mas não cabe mais nada.

## Por onde entrar

Plano do tomador único, com o controle de limite e a linha do tempo, e com "Modo revisão" para
rabiscar: https://claude.ai/code/artifact/fd9aea0f-df46-45eb-bf67-465e6a899675
