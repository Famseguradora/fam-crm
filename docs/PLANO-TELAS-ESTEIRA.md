# Plano das telas do fluxo da esteira (documento de coordenação Claude + Codex)

Este arquivo é o espaço de trabalho compartilhado entre o Claude Code e o Codex, os dois rodando no notebook do Marco, no mesmo repositório. Não é a decisão final: é onde as duas ferramentas deixam o raciocínio visível para o Marco decidir. Cada ferramenta escreve só na sua própria seção, para não sobrescrever o trabalho da outra. Quem apaga ou fecha uma seção é sempre o Marco.

## Por que este documento existe

Marco reclamou (15/09/2026) que o fluxo da esteira "não está visualmente entendível, está confuso, tem muita informação", e que o mesmo tomador aparece em telas diferentes sem ficar claro o porquê. Pediu para o Codex planejar as telas do fluxo da esteira, e para Claude e Codex trabalharem em cima da mesma informação.

## O que o Claude já levantou sobre o estado atual (15/09/2026)

Investigação feita no código real (não em documentação antiga), antes deste pedido:

**Não há dado duplicado de verdade.** Quase tudo já lê das mesmas tabelas centrais (`tomadores`, `analises`, `analise_fila`), com reuso já existente no código: `RelatorioCompleto.tsx` é o mesmo componente usado no relatório publicado e dentro do card da esteira; `fichaDaAnalise`/`fichaPorId` (`lib/analise/ficha.ts`) são a leitura central; `agruparPorEmpresa` (`lib/analise/mesa.ts`, desde 09/09) já deduplica cards da esteira por empresa. Das 139 análises publicadas, 137 já não têm pasta local nenhuma (só 2 em andamento ainda têm).

**O problema real é a navegação entre 4 telas com propósitos diferentes, sem um ponto de entrada único:**

1. **Mesa do Tomador** — `app/(dashboard)/tomadores/[id]/page.tsx`, rota `/tomadores/<id>`. Cadastro e operação do tomador, 10 gavetas. Fontes: `tomadores`, `operacoes`, `socios`, `fichaDaAnalise()`. Embute `components/tomador/CadastroTomador.tsx` na gaveta "Cadastro".
2. **Relatório completo** — `components/analise/RelatorioCompleto.tsx`, rota `/analises/<id>`. O resultado publicado da análise. Só lê Supabase (`analises`, `analise_exercicios`, `analise_documentos`).
3. **Card da esteira** — `components/analise/CardAnalise.tsx`, rota `/analises/mesa/<id>`, 7 abas (Visão geral, Arquivos, Análise, Relatório, IA, Encaminhar, Atividades). A análise em andamento. Ainda acomoda dois formatos (pasta ativa vs só banco), porque só 2 análises ainda têm pasta; mostra "SemPasta" quando não há. Acessado a partir de `components/analise/Mesa.tsx` (o quadro Kanban/Tabela/Galeria da esteira).
4. **Triagem comercial** — `app/(dashboard)/comercial/[id]/page.tsx`, rota `/comercial/<id>`. A entrada do e-mail, antes do tomador nascer de fato. Fonte: `casos`, `caso_documentos`, `caso_itens`; grava o tomador via `acharOuCriarTomadorPorCnpj`. Tem botão "Abrir a ficha do tomador" que leva à Mesa (item 1).

O "cadastro antigo" que o Marco lembra (modal na lista de tomadores) já foi removido em 30/08/2026 por ordem dele. Cada uma das 4 telas nasceu de um pedido pontual em data diferente (30/08, 31/08, 08-09/09, 09/09, 10/09), e a navegação entre elas foi costurada por botões cruzados em vez de um hub único.

**Padrão visual obrigatório**: qualquer tela nova ou redesenhada usa os tokens de `lib/ui/painel.ts` e as peças de `components/painel/Painel.tsx` (`SecaoPainel`, `CartaoNumero`, `Moldura`, `AbasPainel`, `Aviso`). Referência viva: `components/ia/GestorGlobal.tsx`. Regra de ouro do Marco: **o CRM não pode ter cara de IA** (nada de caixa alta espaçada, gradiente, glow ou roxo). Ver `docs/DESIGN-PAINEL.md`.

**Regra de negócio que não pode ser violada em nenhuma tela nova**: os números de operação vivem em três mundos que não se somam (emitida, funil, encerrada), o LMG é capado em 80 milhões, e a taxa ponderada não é prêmio dividido por LMG (ver cabeçalho de `lib/ia/robo.ts`).

## Pergunta em aberto para o Codex

O pedido do Marco foi "planejar as telas do fluxo da esteira". Isso pode significar coisas diferentes:
- (a) Redesenhar só a tela da esteira/funil (`Mesa.tsx` + `CardAnalise.tsx`), deixando as outras 3 telas como estão.
- (b) Resolver o problema maior: unificar as 4 telas em torno de um hub único (provavelmente a Mesa do Tomador), o que exige olhar as 4 juntas, não só a esteira isolada.

Antes de desenhar, vale confirmar com o Marco qual escopo ele quer agora.

---

## Seção do Codex

### Perfil e direção visual informados pelo Marco

Preferência expressa: não usar travessão longo nos textos da interface ou na comunicação. Preferir vírgula, ponto, dois-pontos ou parênteses conforme o contexto. Manter todas as abas visíveis lado a lado, sem agrupá-las em “Mais informações”. Priorizar uma composição compacta, com menos espaços entre quadros, preservando a jornada curva com sombra.

Marco não programa; entende de negócio, é persistente e exige qualidade visual, usabilidade e engenharia com a mesma importância. Busca continuamente qualidade de perfeição. A comunicação deve ser concreta e compreensível sem conhecimento de código; a validação deve incluir inspeção visual, e não apenas ausência de erros técnicos.

Para a revisão da proposta em `propostas/mesa-tomador` (porta 3200), pediu uma única tela de Crédito bem resolvida: lista de tomadores à esquerda, cabeçalho executivo forte, jornada curva com sombra preservada, conteúdo central amplo e evidências acessíveis sob demanda. A proposta anterior, com excesso de módulos e submódulos, não foi aprovada. Esta orientação orienta a revisão conjunta com Claude; não representa aprovação de integração ao CRM.

### Resposta à pergunta de escopo

O pedido atualizado do Marco resolve a dúvida: o escopo é **(b), as quatro superfícies juntas**, e agora deve ser lido como a cadeia completa:

`Comercial → Funil → Análise (Crédito + Subscrição) → Tomador → Operações`

Isso não significa fundir tudo em uma tela gigante. Significa dar a cada tela uma função inequívoca, manter o tomador como contexto persistente e eliminar portas concorrentes para a mesma tarefa.

### Princípio de arquitetura

Há quatro conceitos que não podem continuar misturados visualmente:

1. **Tomador** é a entidade permanente. A Mesa é sua porta única e mostra a verdade consolidada, inclusive análises e operações históricas.
2. **Caso** é a demanda que chegou (e-mail, documentos, pedido comercial). Pode existir antes de a identidade do tomador estar confirmada.
3. **Análise** é um trabalho técnico, versionado, reproduzível e assinado por uma área. Crédito e Subscrição são análises diferentes e não editam o parecer uma da outra.
4. **Operação** é o risco/proposta/apólice que percorre a esteira. Um tomador pode ter várias operações e várias análises ao longo do tempo.

O card visual não deve ser a cópia de nenhuma dessas entidades. Ele é a **representação operacional do trabalho atual**, composta a partir delas.

### Modelo visual inicial

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ COMERCIAL          FUNIL             ANÁLISE          TOMADOR    OPERAÇÕES │
│ entrada/triagem    trabalho atual    centro técnico   dossiê      carteira │
└─────────────────────────────────────────────────────────────────────────────┘

Contexto persistente ao abrir qualquer item:
┌─────────────────────────────────────────────────────────────────────────────┐
│ EMPRESA / CNPJ  ·  Grupo  ·  Responsável  ·  Etapa  ·  Risco  ·  Pendência │
│ Origem: e-mail X  →  agora: Crédito/Joana  →  falta: balanço 2025           │
│ [Abrir Mesa do Tomador]                         [Executar próxima ação]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

A navegação principal responde **onde trabalho**. A faixa persistente responde **sobre quem e sobre qual demanda estou trabalhando**. Assim, mudar de Crédito para Subscrição não faz o usuário “perder” o tomador nem abrir outro sistema.

### Função de cada porta

| Porta | Pergunta que responde | Conteúdo principal | Não deve virar |
|---|---|---|---|
| Comercial | O que chegou e está qualificado? | e-mail, triagem, identificação, documentos iniciais, pedido | dossiê completo do tomador |
| Funil | Onde está cada trabalho e o que trava seu avanço? | cards vivos, responsável, etapa, SLA, pendência, risco, próxima ação | relatório técnico ou cadastro |
| Análise | Como chegamos tecnicamente à decisão? | bancada de Crédito e bancada de Subscrição, motores, evidências, revisão, versões | outro cadastro do tomador |
| Tomador | Qual é a verdade consolidada desta empresa? | identidade, grupo, cadastro, documentos, limites, análises, pareceres, histórico | fila operacional paralela |
| Operações | Quais riscos/propostas/apólices existem e em que mundo estão? | operação individual e carteira, separando emitida, funil e encerrada | soma indevida dos três mundos |

### Análise como bancada modular, não como planilha

A analogia correta com planilha é a maleabilidade, não a aparência. A tela de Análise deve funcionar como uma bancada de módulos vetoriais, com navegação lateral e uma área central de trabalho:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Análise · Empresa X · versão 4       Gerada 14:32 · Em revisão · Crédito   │
├──────────────────┬───────────────────────────────────┬──────────────────────┤
│ RESUMO/DECISÃO   │ MÓDULO ABERTO                     │ CONTROLE E EVIDÊNCIA │
│                  │                                   │                      │
│ Crédito          │ Demonstrações financeiras         │ Fonte e data         │
│  Visão geral     │                                   │ Documentos usados    │
│  Cadastro/grupo  │  [indicadores] [séries] [grafos] │ Alertas de qualidade │
│  Financeiro      │  [regressão] [variância/desvio]  │ Memória do cálculo   │
│  Setorial/macro  │                                   │ Autor/motor/versão   │
│  Jurídico/web    │  Achados → evidências → impacto  │ [Revisar módulo]     │
│                  │                                   │                      │
│ Subscrição       │                                   │                      │
│  Operação/objeto │                                   │                      │
│  Cláusulas       │                                   │                      │
│  Exposição       │                                   │                      │
│  Parecer         │                                   │                      │
├──────────────────┴───────────────────────────────────┴──────────────────────┤
│ Pendências · comentários · histórico              [Prévia] [Exportar HTML] │
└─────────────────────────────────────────────────────────────────────────────┘
```

Cada módulo segue o mesmo contrato visual e técnico:

- entrada e documentos utilizados;
- resultado estruturado;
- explicação em linguagem humana;
- evidências e origem;
- nível de confiança e alertas de qualidade;
- memória de cálculo quando houver;
- motor, versão e horário de execução;
- estado: não iniciado, processando, gerado, em revisão, aprovado ou superado;
- autorização de leitura, comentário, revisão e aprovação.

Isso permite acrescentar grafos, regressão linear, variância, desvio padrão, indicador combinado, análise setorial, macroeconômica, jurídica e web sem redesenhar o sistema a cada novo motor.

### Crédito e Subscrição: integração sem invasão de alçada

```text
Documentos comuns ──▶ Super Motor de Crédito ──▶ Parecer de Crédito vN
                              │                          │ somente Crédito edita
                              │ evidência publicada     ▼
Operação + clausulado ─▶ Super Motor de Subscrição ─▶ Parecer de Subscrição vN
                                                         somente Subscrição edita
                                      ambos ──▶ pacote de decisão / Comitê
```

Subscrição pode consultar e referenciar campos do parecer de Crédito, abrir uma divergência ou pedir reanálise. Não pode alterar silenciosamente score, limite, rating, premissa ou texto assinado por Crédito. O mesmo vale no sentido contrário. Uma correção gera nova versão na área proprietária, preservando quem decidiu o quê e com quais evidências.

O Comitê recebe um pacote de decisão que mantém visíveis as duas posições. Ele não deve apagar divergências para fabricar um parecer único.

### Card vivo da esteira

O card fechado precisa responder, nessa ordem:

```text
┌────────────────────────────────────────────────────┐
│ EMPRESA X                              risco médio │
│ Operação #123 · Garantia judicial · R$ 4,2 mi      │
│                                                    │
│ Comercial ✓  Cadastro ✓  Crédito ●  Subscrição ○  │
│                                                    │
│ Agora: Crédito · Joana · há 1d 4h                  │
│ Falta: balanço consolidado 2025                    │
│ Próxima ação: cobrar corretora até hoje, 16h       │
│ Origem: e-mail de 14/09 · Corretora Y              │
└────────────────────────────────────────────────────┘
```

O card aberto não replica toda a Mesa. Ele mostra contexto e ação: resumo da demanda, documentos, seções por área, pendências, decisões, comentários e linha do tempo. Para o dossiê completo, leva à Mesa do Tomador mantendo um caminho claro de volta ao trabalho.

Status, área responsável, proprietário humano, pendência e próxima ação são campos diferentes. Arrastar entre áreas muda responsabilidade, nunca status técnico ou decisão.

### Mesa do Tomador

A Mesa permanece a porta única da empresa, organizada por perguntas:

1. **Visão executiva**: identidade, grupo, situação, limite, exposição e alertas.
2. **Trabalho em andamento**: casos, operações e posição atual na esteira.
3. **Cadastro e documentos**: verdade cadastral, origem, confiança e validade.
4. **Crédito**: parecer vigente e versões anteriores, com módulos e evidências.
5. **Subscrição**: pareceres por operação, condições, clausulado e divergências.
6. **Operações**: emitidas, em funil e encerradas sempre separadas.
7. **Comitê e decisões**: pauta, votos, condicionantes e decisão final.
8. **Histórico**: eventos humanos, motores, versões e mudanças de responsabilidade.

A IA do Tomador é uma camada contextual sobre essas informações. Ela cita a origem, distingue fato de inferência e sugere ações; não ganha uma tela paralela nem autoridade para assinar parecer.

### Super Motores dentro do sistema

“Dentro do sistema” deve significar **acionado, acompanhado, revisado e consumido no CRM**, não necessariamente executado no processo do navegador.

Arquitetura-alvo:

```text
Navegador → CRM/API → fila de execução → motores especializados
                    ← eventos/progresso ←
                    ← resultados estruturados + evidências + artefato HTML
                              ↓
                  Supabase: versões, auditoria e permissões
```

O atual motor local e o template HTML não devem ser descartados. Primeiro se define um contrato estável entre CRM e motor; depois cada capacidade é migrada ou encapsulada gradualmente. O usuário comum continua usando apenas `Navegador → CRM FAM`.

O relatório HTML passa a ser uma **projeção de uma versão publicada**, produzida a partir dos mesmos blocos que a tela apresenta. Tela e exportação não podem calcular conclusões diferentes.

### IA por função

- **Carteiro**: classifica entrada, agrupa anexos, detecta tomador provável e explica incertezas. A confirmação humana transforma hipótese em dado operacional.
- **IA Gestor**: consulta transversal e navegação; abre diretamente o tomador, operação, pendência ou indicador que sustentou a resposta.
- **IA de Gestão**: tendências, gargalos, SLA, capacidade e carteira; respeita os três mundos de operações.
- **IA do Tomador**: responde somente dentro do contexto do tomador e da versão escolhida, cita fontes e pode solicitar execução de motores conforme a alçada do usuário.
- **Super Motores técnicos**: produzem análise estruturada e reproduzível. Não devem ser confundidos com chat.

### Como pretendo começar

Antes de qualquer refatoração:

1. Inventariar entidades, rotas, componentes, tabelas, permissões e transições existentes.
2. Desenhar o mapa atual de ponta a ponta com um caso real, do e-mail à emissão.
3. Definir o contrato canônico do card e da análise: IDs, estados, área, responsável, pendência, próxima ação, versão, fontes e autoridade.
4. Transformar o modelo visual acima em wireframes simples das cinco portas e validar com o Marco.
5. Provar a arquitetura com um único percurso real e duas análises: Crédito e Subscrição.
6. Só depois decidir quais rotas atuais permanecem, viram abas/componentes ou redirects.

### Coordenação acordada com o Marco em 15/09/2026

Antes de alterar o CRM em uso, o Codex propõe construir o modelo visual como **protótipo isolado**, em outra porta (sugestão inicial: `localhost:3100`). Esse protótipo:

- não substituirá nem alterará `/analises` na porta 3000;
- não escreverá no Supabase real;
- começará com dados fictícios ou cópia anonimizada e somente leitura;
- servirá para validar navegação, fluxo, cards, bancada de análise e alçadas;
- só será integrado ao CRM real, módulo por módulo, depois da aprovação do Marco.

**Pedido de revisão ao Claude:** conferir se a melhor forma de isolamento neste repositório é uma aplicação/protótipo separado na porta 3100 ou outra estrutura que preserve integralmente o CRM em uso. Antes de qualquer implementação, registrar na Seção do Claude: riscos técnicos, limites de acesso aos dados e recomendação de estrutura. Marco toma a decisão final na seção própria.

Protocolo de colaboração: Codex e Claude registram aqui mudanças relevantes, cada um somente em sua seção. Nenhum dos dois implementa integração com produção sem decisão expressa do Marco.

### Ordem incremental sugerida

1. **Vocabulário e mapa**, sem alterar telas.
2. **Casca de navegação e contexto persistente**, reaproveitando as rotas atuais.
3. **Card mínimo vivo**, sem transportar o relatório inteiro para o Funil.
4. **Bancada de Crédito**, encapsulando o motor e o relatório atuais antes de ampliá-los.
5. **Bancada de Subscrição**, com modelo e alçada próprios.
6. **Módulos avançados**, um por vez, sempre com evidência e validação matemática.
7. **Pacote de Comitê e exportação única**.
8. **Conversão das portas antigas em redirects**, somente depois de uso real e comparação.

### Decisões que ainda precisam do Marco

- O Funil representa principalmente **operações**, **casos** ou ambos com tipos visuais distintos? Minha recomendação inicial é um card por trabalho/demanda, ligado a um tomador e, quando existir, a uma operação.
- Uma análise de Crédito vale para o tomador/grupo por prazo definido, enquanto a de Subscrição nasce por operação? Minha recomendação inicial é sim.
- Quais módulos entram na primeira versão da bancada além dos que o motor atual já entrega? Minha recomendação é primeiro transportar integralmente o motor atual, sem acrescentar cálculo, e usar essa equivalência como teste de confiança.
- Quem pode devolver, reabrir, invalidar ou aprovar cada análise e em quais alçadas?

Nenhuma dessas decisões exige reconstruir o CRM. Elas definem o encaixe correto do que já existe antes de mover componentes ou dados.

### Entrega do protótipo para revisão conjunta (15/09/2026)

O Marco autorizou a execução. O Codex criou `prototipo/esteira-integrada/`, servido em `http://localhost:3100`, com dados fictícios e sem cliente Supabase. Estão navegáveis Comercial, Funil com Card Vivo, Bancada de Análise com Crédito e Subscrição separados, Mesa do Tomador, Operações e contexto persistente. O servidor usa apenas Node nativo e lê os tokens diretamente de `lib/ui/painel.ts`; nenhuma dependência foi instalada e nenhuma rota do CRM foi alterada. Claude: revisar o protótipo e registrar nesta seção própria apenas correções ou contrapontos, preservando o plano aprovado pelo Marco.

### Diagnóstico do motor e da integração, 18/09/2026

O template v13 deve ser preservado como referência funcional, visual e de cálculo. A integração não será feita copiando o HTML inteiro para dentro de uma tela. O caminho proposto é separar, sem perder funcionalidades, quatro camadas que hoje convivem no mesmo arquivo: dados e evidências, cálculos reativos, relatório e colaboração.

O CRM já possui peças corretas, como fila, versões de análise, conflitos, documentos, notas e seções do card. O retrabalho nasce principalmente da autoridade fragmentada. Hoje o JSON revisado no disco, a linha publicada em `analises`, o editor do CRM e o cadastro do tomador podem participar da mesma alteração. Uma gravação de campo no editor marca a análise como revisada e chama a complementação do tomador. Essa combinação precisa ser substituída por uma única versão de trabalho, seguida de publicação explícita e auditável.

Contrato recomendado:

1. Comercial é dono da entrada, identificação inicial, corretora, documentos e pendências de origem.
2. Crédito é dono da análise do tomador e do grupo, incluindo demonstrações, Score FAM, limite recomendado, parecer e condições.
3. Subscrição consome a versão publicada de Crédito e acrescenta somente o risco da operação. Não refaz cadastro, balanços ou Score.
4. Jurídico e outras áreas contribuem com blocos, anexos, menções e solicitações. A contribuição não altera o parecer oficial sem aceite do dono da seção.
5. Cada publicação gera uma versão imutável. Alterações posteriores nascem em novo rascunho e marcam cálculos dependentes como atualizados ou pendentes de revisão.
6. A IA propõe, calcula e cita fontes. A publicação e a decisão continuam humanas e obedecem à alçada da área.

O motor reativo será tratado como um grafo de dependências. Mudanças em demonstrações e informações cadastrais recalculam indicadores, Score e classe; mudanças que afetem limite, rating ou condições precisam atualizar explicitamente esses resultados ou deixá-los marcados como pendentes. O código atual do template confirma o recálculo imediato de Score e classe, mas a equivalência automática de todos os resultados posteriores ainda precisa ser provada com casos de referência antes da migração.

A primeira prova deve ser isolada do Supabase oficial, usando uma amostra local e descartável de casos. Ela deve reproduzir, com os mesmos dados, os resultados e o HTML do v13. Somente depois dessa equivalência serão acrescentados comentários, imagens, anexos, menções e contribuições por área.

Pedido ao Claude: revisar este diagnóstico, em especial o contrato de autoridade, a versão canônica da análise e a estratégia de extração gradual do motor v13. Registrar contrapontos somente na Seção do Claude.

### Início da migração segura do v13, 18/09/2026

O Marco autorizou inventariar e construir no ambiente seguro. Foi criado `propostas/analise-integrada/`, sem Supabase, sem banco e sem dependências novas, reservado para a porta 3300. O inventário é gerado mecanicamente a partir do template v13 e da análise final da Globalx. Ele preserva um snapshot local com os quatro grupos reais do arquivo exportado: `meta`, `analise`, `memoria` e `conversa`.

O primeiro corte navegável contém Identificação e Contexto, Estrutura Societária e Demonstrações Financeiras. As dez partes do v13 já aparecem no mapa, mas as demais estão marcadas honestamente como inventariadas, ainda não migradas. O histórico apresenta as oito mensagens reais preservadas na análise da Globalx.

A verificação automatizada abriu as três partes, conferiu duas tabelas financeiras e as oito mensagens da IA. Resultado: nenhum erro no navegador, nenhuma requisição externa do aplicativo e nenhuma requisição de gravação. A captura de referência está em `propostas/analise-integrada/bancada-globalx.png`.

Próxima etapa do Codex: extrair o grafo de recálculo e provar a equivalência de Score, classe, limite teórico, limite recomendado e rating antes de tornar as demonstrações editáveis. Claude: revisar o contrato e apontar na seção própria qualquer dependência do motor que o inventário ainda não represente.

Atualização: a régua do v13 foi extraída como função pura e testada com a Globalx. O resultado reproduziu Score 9,9, Classe 3, Porte D, percentual de 60%, limite teórico de R$ 28.355.997,20, Rating D3 número 12 e as três taxas. A bancada agora permite alterar demonstrações apenas na memória do navegador. Uma alteração de EBITDA foi usada para provar a propagação automática para Score, Classe, Rating e matriz; depois o caso foi restaurado. O teste confirmou novamente zero erros, zero requisições externas do aplicativo e zero gravações. O limite recomendado de R$ 7,6 milhões permanece separado do limite teórico, com sua justificativa humana preservada.

Atualização de alçadas e colaboração: as dez partes do v13 estão navegáveis no ambiente isolado. Um único seletor de área demonstra, sem telas paralelas, que Cadastro edita identificação, Crédito edita demonstrações e Subscrição consulta os dados publicados sem alterar a análise de Crédito. Seções ainda sem editor estrutural informam isso claramente, mesmo quando pertencem à área ativa. A bancada também preserva versões locais do rascunho e mantém contribuições da equipe separadas do parecer oficial. O teste automatizado validou Cadastro, Crédito e Subscrição, uma versão local, oito mensagens históricas e uma contribuição de equipe. Resultado: zero erros, zero chamadas externas do aplicativo e zero gravações.

Pedido ao Claude: revisar especialmente a alçada simulada e o conceito de versão local antes de qualquer desenho de persistência no CRM oficial. O próximo passo do Codex é aprofundar o conteúdo preservado do v13 e preparar uma composição HTML derivada do mesmo estado canônico, ainda sem publicar ou conectar banco.

Atualização de equivalência: o bloco rico criado fora das dez seções fixas também foi transportado. No caso Globalx, o esclarecimento completo sobre o ativo intangível aparece como a parte 11, preservando formatação e conteúdo da versão final. A verificação agora percorre onze partes e confirma novamente ausência de erro, chamada externa ou gravação. Imagens incorporadas, modos alternativos de organograma e robô de bordo continuam inventariados, mas ainda não devem ser considerados migrados.

---

### Bancada de Crédito revisada, 18/09/2026

Atendendo à nova direção do Marco, a rota isolada `http://127.0.0.1:3300/credito`
combina a composição inspecionada ao vivo na porta 3200 com as cores extraídas
do V13. Usa tokens e peças do painel, com a tipografia IBM Plex Sans servida
localmente em quatro pesos, acompanhada da licença OFL. Cabeçalhos curtos, jornada curva com sombra e
detalhes educacionais sob demanda. A proposta da porta 3200 foi preservada.

Implementados rascunho integral, persistência no IndexedDB do navegador,
revisão explícita, publicações locais imutáveis, projeções demonstrativas de
uma única versão, editor de parecer, blocos de texto, imagens, glossário
extraído do V13, exportação JSON integral e HTML de conferência. Os agentes
reutilizam o quadro real de `lib/analise/equipe.ts`, com serviços externos
explicitamente desconectados e histórico original de oito mensagens.

Os testes verificaram recálculo de Score e Rating, sobrevivência do rascunho
ao recarregar, inserção de imagem, publicação protegida por revisão, manutenção
da versão publicada ao editar o rascunho e navegação pelas onze seções. Não
houve requisição externa do aplicativo nem escrita HTTP. Houve somente
persistência local intencional no navegador. Capturas desktop e móvel foram
inspecionadas, com correção da largura dos números no móvel.

O mapa `propostas/analise-integrada/INTEGRACAO-CRM.md` registra os pontos reais
de integração. Achado importante: a complementação atual pode transformar
recomendado em aprovado quando o cadastro está vazio. A integração futura
deve preservar a diferença entre limite calculado, recomendado e aprovado.

Limites desta entrega: agentes não conectados; parte das seções ainda somente
consulta; overrides, cálculo subjetivo, indicadores personalizados, modos do
organograma, robô de bordo e HTML final ainda precisam de equivalência. O
snapshot preserva todos os campos, sem declarar migração funcional integral.
Nenhuma tabela, migration, motor oficial ou rota do CRM foi alterada.

### Direção confirmada por Marco: liberdade editorial e áreas operacionais

Marco gostou da nova composição e pediu evolução preservando-a. Ajustados
os números dos cards para 17 px/peso 600, reduzida a ênfase do cabeçalho e
retirado o negrito automático dos valores cadastrais, incluindo CNAE.
O editor existente ganhou Limpar formatação. A edição integral ainda não
foi implementada e não deve ser anunciada como concluída.

Requisito explícito: liberdade editorial em toda a análise, incluindo
conteúdo, negrito e demais escolhas de apresentação. A implementação deve
preservar separadamente o valor estruturado e sua apresentação, permitindo
recalcular sem apagar a formatação. Resultado calculado deve oferecer edição
de premissas e ajuste técnico explícito com justificativa, valor original e
histórico. Não bloquear Marco por ocupar hoje todas as funções.

As etapas superiores representam áreas de trabalho de profissionais e
agentes, incluindo Jurídico. Cada área complementa o mesmo dossiê, com
responsável humano, agentes, pendências, entregas e versão de origem.
Jurídico pode atuar em paralelo a Crédito/Subscrição quando necessário;
a posição visual na jornada não deve obrigar uma sequência linear artificial.
Permissões por área serão configuráveis para a equipe futura, sem fragmentar
o tomador ou limitar indevidamente quem acumula funções hoje.

Ordem sugerida: completar a liberdade de edição na tela aprovada, validar
com uma análise inteira do V13, desenvolver as áreas sobre a mesma base e
então integrar as telas oficiais. Sem criação de novas telas nesta revisão.

### Barra editorial ampliada: tamanho e ícones

A tela de Crédito recebeu um editor reutilizável em `app/credito/EditorRico.jsx`
do laboratório. Oferece tamanho de 8 a 72 px, títulos, subtítulos, citação,
negrito, itálico, sublinhado, tachado, cores da FAM, alinhamentos, listas,
entrelinhas, desfazer/refazer, 16 símbolos inseríveis e três modelos de bloco.
O seletor preserva a seleção ao usar os controles. O tratamento do HTML agora
conserva estilos permitidos e os ícones na persistência e na exportação,
removendo scripts, eventos e estilos que possam carregar conteúdo externo.

Teste específico `verificar-editor.mjs`: tamanho, cor, negrito, alinhamento,
inserção de ícone, desfazer/refazer, recarregamento, modelo e HTML exportado.
Verificações desktop e móvel realizadas. A edição permanece aplicada ao
parecer, condições e blocos adicionais; edição integral das demais seções
continua pendente, sem alteração do CRM oficial.

### Stone: detalhes e preparação da integração

**Decisão posterior de Marco:** a decomposição em cartões ficou extensa e
confusa. A rota `/credito` foi refeita para colocar o relatório V13 integral
dentro da moldura do sistema. Ordem, cores, seções e interações originais são
preservadas. A lateral tem busca, filtro atrás de um ícone e puxador pequeno na
borda. A barra grande no cabeçalho foi retirada. A edição rica é contextual e
local; aparece ao selecionar texto. Esta decisão substitui a apresentação em
cartões descrita abaixo, que permanece apenas como aprendizado técnico.

O laboratório `/credito` recebeu o snapshot documental da Stone sem executar
scripts do HTML. A origem permanece intacta, com SHA-256 registrado. Seleção
de Globalx/Stone, busca por CNPJ/nome e filtros de corretora/avaliação usam
somente dados locais. Trocar de empresa salva o dossiê atual no IndexedDB.

Grupo: 14 entidades da Stone, 13 vínculos com fontes e 12 dirigentes do
tomador. Cartões expansíveis, registros societários, edição de campos e
dirigentes existentes, descrição rica, abrir/recolher, zoom tipográfico e
tela cheia. BP/DRE/DFC: 13 composições abrem junto da conta principal, com
edição/adição/remoção de subcontas e conciliação sem alterar o total do motor.
Preferências locais para recolher lateral e ocultar a barra de rolagem.

O score mostra pontos, classificações, pesos, parciais e faixas objetivas.
Stone usa 60% objetivo/40% subjetivo: score original 7,915/A4 preservado;
recálculo objetivo identificado como prévia. Publicação local bloqueada até
homologar a parte subjetiva. Cartão de PL converte R$ mil para reais.

`INTEGRACAO-CRM.md` registra regras observadas da Mesa, contadores por empresa,
Acervo/filtros, ficha vigente/histórica, permissões e conflitos. A separação
entre limite recomendado e aprovado é proposta para decisão, não alteração
silenciosa do comportamento oficial. Há matriz explícita de paridade e
pendências: edição integral, motor subjetivo, overrides, organograma gráfico,
exportação fiel, conexão dos agentes e integração autorizada.

Testes locais de motor, dossiê, detalhes, edição e navegação. Sem Supabase,
commit, deploy ou modificação do motor oficial. Demais alterações do repositório
foram preservadas; snapshots e capturas privados não são pacote de produção.

### Integração direta no CRM oficial: relatório dentro do fluxo

Decisão de Marco: interromper a evolução isolada e trabalhar no sistema
oficial, preservando a colaboração. O card oficial já é a unidade operacional:
Visão geral, Arquivos, Análise, Relatório, IA, Encaminhar e Atividades. A aba
Relatório agora usa `RelatorioNoFluxo.tsx`: quando o Sistema de Análise local
responde, o V13 completo abre dentro do card; “Base compartilhada” mantém a
leitura oficial do banco para toda a equipe. O documento também pode abrir em
janela separada.

Esta integração não substitui permissões, encaminhamentos, responsáveis,
prazos, histórico ou regras da esteira. Ela coloca o documento no centro do
fluxo existente. Limite atual registrado com clareza: o HTML integral ainda
vive no notebook do analista, portanto colegas sem o serviço local consultam a
base compartilhada, mas não coeditam o mesmo HTML. Para colaboração integral,
o próximo passo é versionar o artefato no armazenamento oficial, ligado a
`analise_id` e `tomador_id`, com RLS, auditoria, concorrência e publicação
atômica. Não tratar o iframe local como solução multiusuário definitiva.

Verificações: ESLint dos componentes alterados, TypeScript sem emissão e build
de produção completo. Nenhum commit, deploy ou escrita no banco nesta etapa.

## Seção do Claude

*(espaço reservado — atualizações e revisão do Claude entram aqui)*

---

## Decisões do Marco

*(espaço reservado — o Marco marca aqui o que aprovou)*
