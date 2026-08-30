-- ============================================================
--  A ANALISE DE CREDITO ENTRA NO CRM · passo 2 do plano do tomador unico.
--
--  So cria tabelas NOVAS. Nao toca em nada que existe: o CRM roda igual
--  enquanto elas estao vazias. Risco zero, por isso vai primeiro.
--
--  Quem manda em que (a regra que evita dado com dois donos):
--    · cadastro, socios, limite APROVADO e operacoes   -> CRM (tomadores)
--    · Score, classe, rating, taxas, limite RECOMENDADO -> analise (aqui)
--    · o documento original e a analise completa        -> disco (ponteiro aqui)
--
--  Banco leve, ordem dele: guarda-se o que se LE (parecer, conclusao, 3 C's,
--  numeros do resultado) e o ponteiro para a analise completa. O detalhe
--  (memoria de calculo, organograma, demonstracoes linha a linha) fica no
--  JSON da pasta e e renderizado em tela a partir dele.
--
--  A REGRA QUE MANDA EM TUDO: a carga nunca aborta. Por isso este schema foi
--  reescrito contra os 131 registros REAIS (medidos em 30/08/2026, com o
--  normalizador do proprio sistema de analises). Toda coluna aqui aceita o
--  que o acervo realmente tem. O que nao casa nao trava: vira linha em
--  `analise_conflitos` com o motivo, e o Marco decide na tela de conferencia.
--
--  O QUE MUDOU DESDE A PRIMEIRA VERSAO, e por que (tudo medido, nao suposto):
--
--   1. `limite_recomendado numeric` estava ERRADO. O campo e TEXTO LIVRE, e em
--      54 das 131 analises passa de 60 caracteres (o maior tem 515). Virou
--      TRES colunas: o texto sempre, o numero so quando sai limpo, e o TIPO
--      que diz o que aquele numero e. Medido: efetivo 85 · teorico 17 ·
--      zero 13 · teto 9 · vazio 7.
--
--   2. `rating` idem, em menor grau: 21 das 131 sao compostas
--      ("C4 (Rating 12 - A6/C4/D3)", "A5/B4/C2") e 1 esta vazia. Virou
--      `rating_txt` (sempre) + `rating_cod` (so quando ha um codigo unico).
--
--   3. `cnpj not null` + check de 14 digitos ABORTARIA A CARGA em 5 analises,
--      que e exatamente o que nao pode acontecer. Sao consorcios, holdings e
--      uma estrangeira, com o campo assim:
--        "52.279.446/0001-09 (SPE) 30.258.297/0001-50 (holding)"
--        "Espanha - Reg. Mercantil de Madrid ... sem CNPJ no Brasil"
--      Agora `cnpj` e NULO quando nao ha uma chave unica e limpa, o texto
--      original fica em `cnpj_texto`, e a linha vai para o relatorio.
--
--   4. `score_final numeric(4,2)` arredondaria em silencio: o acervo tem ate
--      4 casas decimais (10,8475) e 21 scores acima de 10 (o maior, 13,025).
--      Virou numeric(7,4). O score acima de 10 e divida do acervo, nao do
--      schema, e esta no relatorio para ele olhar.
--
--   5. `analise_exercicios` prometia uma chave (analise_id, exercicio) inteira,
--      mas a base nem sempre e um ano: existe balancete ("31/03/2026"). A
--      chave passou a ser o ROTULO, e o ano fica ao lado, para ordenar.
--
--   6. Tabela nova `analise_conflitos`: e onde o relatorio mora e onde a
--      decisao dele fica registrada. Sem ela, cada carga pediria a mesma
--      aprovacao de novo.
--
--  Escrita: as tabelas da analise sao carregadas por fora (a carga das 131,
--  e depois a Edge Function). Ninguem escreve nelas pela chave publica. A
--  UNICA excecao e a decisao do Marco em `analise_conflitos`, que e a tela de
--  conferencia: la o autenticado pode gravar, e SO nas colunas da decisao.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. analises · uma linha por VERSAO de analise
--    Analise refeita guarda todas; a ultima e a vigente (decisao 4).
--    Medido: 131 analises, 120 empresas, 9 CNPJs com 2 ou 3 versoes.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.analises (
  id                 uuid primary key default gen_random_uuid(),

  -- a chave do sistema local: "08260577000144-2026-08-28" (cnpj + data).
  -- Medido: os 131 ids sao distintos, entao ela pode ser unica de verdade.
  chave_local        text not null unique,

  -- a ligacao com o CRM. Nula ate o saneamento (fase 0) casar CNPJ com tomador;
  -- 97 dos 116 CNPJs ja existem em `tomadores`, o resto e revisado um a um.
  tomador_id         uuid references public.tomadores(id) on delete set null,

  -- SO DIGITOS, 14 posicoes, e NULO quando a analise nao tem uma chave unica.
  -- Nulo aqui nao e falha: e o caso do consorcio, da holding e da estrangeira.
  cnpj               text,
  -- o que a analise escreveu, sempre, mesmo quando o de cima e nulo
  cnpj_texto         text,

  -- identificacao como a analise conheceu (o cadastro oficial e o do tomador)
  razao_social       text not null,
  nome_curto         text,
  razao_original     text,
  corretora          text,
  grupo              text,
  segmento           text,
  setor              text,                     -- a gaveta derivada do segmento

  data_analise       date not null,            -- vem do `ordem` (aaaa-mm-dd), nao do texto dd/mm/aaaa
  versao             integer not null default 1,
  vigente            boolean not null default true,

  -- ── o resultado, em numero ────────────────────────────────
  score_final        numeric(7,4),             -- ate 4 casas no acervo; 21 estao acima de 10
  classe             text,                     -- "1".."7", e "" em uma analise
  porte              text,                     -- o texto como veio
  porte_cod          text,                     -- a LETRA, quando ela sai limpa (A..F)
  rating_txt         text,                     -- SEMPRE o que a analise escreveu
  rating_cod         text,                     -- "C4", so quando ha um codigo unico. Senao NULO.
  rating_numero      integer,
  nivel_risco        text,                     -- o texto como veio
  nivel_cod          text,                     -- Baixo / Medio-Baixo / Medio / Medio-Alto / Alto
  recomendacao       text,                     -- o texto como veio
  decisao_cod        text,                     -- Aprovar / Aprovar com ressalvas / Analise complementar / Bloqueio / Reprovar

  -- ── o limite: o furo que quase entrou no banco ────────────
  -- Texto SEMPRE. Numero SO quando sai limpo. Tipo SEMPRE, dizendo o que o
  -- numero e. Nunca chutar: sem certeza, o numero fica nulo e a linha vai
  -- para `analise_conflitos`.
  --
  --   efetivo    limite concedido de verdade, sai do PL do tomador
  --   teto       limitado pelo teto operacional da FAM, nao pela capacidade
  --   teorico    a propria analise escreveu que o numero e teorico
  --   zero       limite zero, quase sempre por patrimonio liquido negativo
  --   sem_limite decisao escrita por extenso, sem numero ("Recusado, sem limite")
  --   vazio      campo em branco de verdade
  --
  -- SO `efetivo` e candidato a virar limite aprovado na tela de conferencia.
  -- Os outros aparecem com o motivo escrito e ninguem os soma por engano:
  -- somar os 131 com um parser ingenuo ja deu R$ 97 bilhoes uma vez.
  limite_recomendado_txt  text,
  limite_recomendado_num  numeric(18,2),
  limite_recomendado_tipo text
    check (limite_recomendado_tipo is null or limite_recomendado_tipo in
           ('efetivo','teto','teorico','zero','sem_limite','vazio')),

  -- POR QUE O NUMERO FOI ANULADO, quando foi. Nulo = nao foi anulado.
  --
  -- Esta coluna existe por causa do furo mais perigoso desta frente, e ele
  -- estava na TELA, nao no banco. A carga tem tres travas que anulam o numero
  -- quando ele nao e confiavel, mas `limite_recomendado_tipo` guarda o que a
  -- analise escreveu e continua `efetivo` depois da anulacao. A ficha do
  -- tomador lia so o tipo, caia no texto cru e mostrava de novo, em verde de
  -- valor confirmado, o numero que a trava tinha tirado: a Conasa aparecia com
  -- "R$ 727.192.500,00" quando o valor de verdade e R$ 54,5 milhoes.
  --
  -- QUEM MOSTRAR LIMITE EM TELA TEM DE LER ESTA COLUNA.
  limite_recomendado_motivo text,

  -- o outro limite do registro (`limite_rs`), texto livre pelo mesmo motivo
  limite_rs_txt      text,
  limite_rs_num      numeric(18,2),
  limite_rs_tipo     text
    check (limite_rs_tipo is null or limite_rs_tipo in
           ('efetivo','teto','teorico','zero','sem_limite','vazio')),

  -- ── as taxas ──────────────────────────────────────────────
  -- Aqui o numero E confiavel: medido, 129 das 131 vem no formato "2,23%" e
  -- as 2 restantes vem "-" ou vazias, que viram nulo e linha de relatorio.
  -- Nao ha paragrafo escondido, por isso nao precisam da coluna de texto.
  -- Em pontos percentuais: 2.23 = 2,23%.
  taxa_tradicional   numeric(7,4),
  taxa_judicial      numeric(7,4),
  taxa_estruturada   numeric(7,4),

  -- ── o que se le ───────────────────────────────────────────
  condicoes          text,
  conclusao          text,
  -- Estes tres NAO estao no indice do sistema: moram no JSON completo da
  -- pasta (conferido: o arquivo tem `tres_cs`, `pontos_positivos` e
  -- `pontos_atencao`). A carga que le o disco os preenche; a carga que le so
  -- o indice deixa nulo. Nulo aqui significa "ainda nao lido", nao "nao existe".
  tres_cs            jsonb,                    -- {carater:{...}, capacidade:{...}, capital:{...}}
  pontos_positivos   text[],
  pontos_atencao     text[],

  -- ── a revisao dele ────────────────────────────────────────
  revisada           boolean not null default false,
  revisado_em        timestamptz,
  fonte              text,                     -- gerada | revisada
  correcoes          jsonb,                    -- o que ele mudou sobre a gerada

  -- ── ponteiro para a analise completa, no disco ────────────
  pasta              text,
  arquivo            text,
  onde               text,

  registrado_em      timestamptz,              -- quando o sistema local registrou
  publicado_em       timestamptz not null default now(),
  publicado_por      text,                     -- usuario ou agente que publicou

  -- o check aceita o nulo DE PROPOSITO: e ele que impede a carga de abortar
  constraint analises_cnpj_digitos
    check (cnpj is null or cnpj ~ '^[0-9]{14}$')
);

-- So UMA vigente por CNPJ. `cnpj is not null` no filtro e o que deixa as
-- analises sem chave conviverem sem brigar entre si.
create unique index if not exists analises_vigente_por_cnpj
  on public.analises (cnpj) where vigente and cnpj is not null;
create index if not exists analises_tomador_idx on public.analises (tomador_id);
create index if not exists analises_data_idx    on public.analises (data_analise desc);
create index if not exists analises_cnpj_idx    on public.analises (cnpj) where cnpj is not null;

comment on table public.analises is
  'Resultado da analise de credito (Score FAM, rating, taxas, limite recomendado, parecer). Uma linha por versao; a vigente por CNPJ tem vigente=true. O detalhe fica no JSON da pasta (ponteiro em pasta/arquivo/onde).';
comment on column public.analises.cnpj is
  'So digitos, 14 posicoes. NULO quando a analise nao tem uma chave unica (consorcio, holding, estrangeira). O texto original fica em cnpj_texto e a linha vai para analise_conflitos.';
comment on column public.analises.limite_recomendado_num is
  'O numero SO quando ele sai limpo do texto. Leia sempre junto com limite_recomendado_tipo: so `efetivo` e limite de verdade.';
comment on column public.analises.rating_cod is
  'O codigo unico (C4), ou NULO quando o texto e composto sem um codigo aplicavel. O texto integral esta em rating_txt.';

-- ─────────────────────────────────────────────────────────────
-- 2. analise_exercicios · o RESUMO financeiro por exercicio
--    E o que poe "2026" em tela. So o resumo: as demonstracoes inteiras
--    ficam no JSON da analise.
--
--    A chave e o ROTULO, e nao o ano: a base nem sempre e um exercicio
--    fechado (existe balancete de 31/03/2026), e uma chave inteira deixaria
--    esses casos de fora ou faria a carga abortar.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.analise_exercicios (
  id                     uuid primary key default gen_random_uuid(),
  analise_id             uuid not null references public.analises(id) on delete cascade,
  rotulo                 text not null,              -- "2025", "31/03/2026", "Balancete 03/2026"
  exercicio              integer,                    -- 2024, 2025, 2026… so quando o ano sai limpo
  base                   text,                       -- Consolidado / Individual / Balancete
  unidade                text not null default 'R$', -- o texto do analista, INTEIRO

  -- A ESCALA, e o achado que a obrigou (auditoria de 30/08/2026):
  -- 140 das 262 linhas NAO estavam em reais. 138 vinham em milhares ("R$ mil",
  -- em 10 grafias) e 2 em milhoes, e isso vivia so como texto livre. A Amper
  -- tinha patrimonio liquido gravado como 865,10 sendo R$ 865,1 MILHOES.
  --
  -- Daqui em diante as colunas numericas abaixo estao em REAIS, uma unidade so,
  -- e `escala` guarda o multiplicador lido (1, 1000 ou 1000000) para a conta ser
  -- auditavel. Escala que nao se consegue ler deixa os numeros NULOS e manda a
  -- analise para o relatorio: a regra continua sendo nunca chutar numero.
  escala                 numeric,

  -- balanco
  ativo_total            numeric(18,2),
  ativo_circulante       numeric(18,2),
  ativo_nao_circulante   numeric(18,2),
  realizavel_lp          numeric(18,2),
  passivo_circulante     numeric(18,2),
  passivo_nao_circulante numeric(18,2),
  exigivel_total         numeric(18,2),
  patrimonio_liquido     numeric(18,2),
  -- DRE
  receita_operacional    numeric(18,2),              -- ROL da analise
  receita_liquida        numeric(18,2),
  ebitda                 numeric(18,2),
  lucro_liquido          numeric(18,2),
  -- caixa e estoque
  caixa                  numeric(18,2),
  estoques               numeric(18,2),

  unique (analise_id, rotulo)
);
create index if not exists analise_exercicios_ano_idx on public.analise_exercicios (exercicio desc);

comment on table public.analise_exercicios is
  'Resumo financeiro por exercicio de cada analise (balanco, DRE, caixa e estoque). So o resumo: a demonstracao inteira fica no JSON da analise. A chave e o rotulo porque a base nem sempre e um ano fechado.';

-- ─────────────────────────────────────────────────────────────
-- 3. analise_documentos · o indice dos documentos que a analise LEU
--    Migrado do _status.json de cada pasta (nome, bytes, sha256 cortado
--    em 16 hex, retrato de quando a analise comecou). O arquivo fica no
--    disco. Anexo enviado pelo CRM continua em `anexos`, e outra coisa.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.analise_documentos (
  id          uuid primary key default gen_random_uuid(),
  analise_id  uuid not null references public.analises(id) on delete cascade,
  tomador_id  uuid references public.tomadores(id) on delete set null,
  nome        text not null,
  bytes       bigint,
  hash16      text,                 -- sha256 CORTADO em 16 hex; nao e o hash inteiro
  retrato_em  timestamptz,          -- quando a foto da pasta foi tirada
  pasta       text,

  unique (analise_id, nome)
);
create index if not exists analise_documentos_tomador_idx on public.analise_documentos (tomador_id);

comment on table public.analise_documentos is
  'Indice dos documentos lidos por cada analise. O arquivo fica no disco; hash16 e sha256 cortado em 16 hex, como o sistema local grava.';

-- ─────────────────────────────────────────────────────────────
-- 4. analise_conflitos · O RELATORIO, e a memoria da decisao dele
--
--    Esta tabela e a razao de a carga nunca precisar abortar: tudo que nao
--    casa cai aqui, com os DOIS valores lado a lado e o motivo escrito, e
--    fica esperando. Nada daqui toca `tomadores` sozinho.
--
--    Ela guarda a decisao para que a proxima carga nao peca a mesma
--    aprovacao de novo.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.analise_conflitos (
  id            uuid primary key default gen_random_uuid(),

  tipo          text not null
    check (tipo in ('sem_chave',        -- a analise nao tem CNPJ unico, ou o CNPJ nao existe no CRM
                    'razao_divergente', -- o nome do CRM e o da analise nao batem
                    'limite_divergente',-- limite aprovado x limite recomendado
                    'limite_incerto',   -- o numero nao saiu limpo do texto (teorico, teto, vazio)
                    'status_contraditorio', -- CRM diz uma coisa, a analise diz outra
                    'dado_fora_do_padrao')),-- score acima de 10, taxa vazia, rating sem codigo

  -- Um dos dois lados pode faltar, e e proposital: o conflito "sem chave" de
  -- uma analise nao tem tomador, e o de um tomador sem CNPJ nao tem analise.
  analise_id    uuid references public.analises(id) on delete cascade,
  tomador_id    uuid references public.tomadores(id) on delete set null,
  campo         text not null default '',  -- 'razao_social', 'limite_aprovado', 'status', 'cnpj'

  -- os dois valores, lado a lado, como texto: e assim que a tela mostra
  valor_crm     text,
  valor_analise text,
  -- o que a carga SUGERE, sem aplicar. Nos casos de CNPJ multiplo, os
  -- candidatos achados no texto entram aqui para ele escolher.
  sugestao      text,
  candidatos    text[],
  motivo        text not null,         -- escrito em portugues, para ele ler e decidir

  situacao      text not null default 'aberto'
    check (situacao in ('aberto','aplicado','ignorado')),
  decidido_por  text,
  decidido_em   timestamptz,
  observacao    text,

  carga_em      timestamptz not null default now(),

  -- A CHAVE ESTAVEL do conflito, gerada pelo banco. E ela que impede o mesmo
  -- conflito de voltar a cada carga e faz a decisao do Marco sobreviver a uma
  -- recarga. Ninguem a preenche: e coluna gerada.
  --
  -- POR QUE NAO UM UNIQUE COMUM: em Postgres nulo nunca e igual a nulo, entao
  -- (tipo, analise_id, tomador_id, campo) com um uuid nulo deixaria o mesmo
  -- conflito entrar de novo a cada carga. O coalesce fecha essa porta.
  --
  -- POR QUE NAO UM INDICE DE EXPRESSAO com o coalesce, que foi a 1a tentativa:
  -- funciona no banco, mas o ON CONFLICT do PostgREST nao sabe mirar numa
  -- expressao, e a carga morria com "there is no unique or exclusion constraint
  -- matching the ON CONFLICT specification". Virando COLUNA, o upsert mira nela.
  chave         text generated always as (
    tipo || '|' || coalesce(analise_id::text, '') || '|' ||
    coalesce(tomador_id::text, '') || '|' || campo
  ) stored
);

create unique index if not exists analise_conflitos_chave_unica
  on public.analise_conflitos (chave);
create index if not exists analise_conflitos_abertos_idx
  on public.analise_conflitos (tipo, carga_em desc) where situacao = 'aberto';
create index if not exists analise_conflitos_tomador_idx on public.analise_conflitos (tomador_id);

comment on table public.analise_conflitos is
  'O relatorio da carga: tudo que nao casou entre a analise e o CRM, com os dois valores lado a lado e o motivo. A carga nunca aborta, escreve aqui. Nada toca `tomadores` sem passar pela tela de conferencia e pela decisao do Marco.';

-- ─────────────────────────────────────────────────────────────
-- 5. Alcadas do agente · quem autorizou o que
--    Copia linha a linha das tres tabelas locais (regras, pedidos,
--    diario.jsonl). Num sistema de credito isso pertence ao banco.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.agente_alcadas (
  acao         text primary key,           -- recado, analisar, batizar, excluir…
  alcada       text not null check (alcada in ('livre', 'pedir', 'proibido')),
  alterado_em  timestamptz not null default now(),
  alterado_por text,
  motivo       text
);

create table if not exists public.agente_pedidos (
  id           text primary key,           -- o id local: "mtd9z12a-4mzcja"
  acao         text not null,
  assinatura   text not null,              -- acao + args, para nao duplicar pedido
  args         jsonb,
  quem         text not null,              -- o funcionario virtual que pediu
  motivo       text,
  status       text not null default 'aberto'
               check (status in ('aberto', 'autorizado', 'negado', 'vencido', 'executado')),
  pedido_em    timestamptz not null,
  decidido_em  timestamptz,
  decidido_por text,
  resultado    text
);
create index if not exists agente_pedidos_abertos_idx on public.agente_pedidos (pedido_em desc) where status = 'aberto';

create table if not exists public.agente_diario (
  id        bigserial primary key,
  em        timestamptz not null,
  tipo      text not null,                 -- alcada | pedido | acao | autorizacao | negativa
  acao      text,
  quem      text,
  por       text,
  de        text,
  para      text,
  args      jsonb,
  motivo    text,
  pedido_id text
);
create index if not exists agente_diario_em_idx on public.agente_diario (em desc);

comment on table public.agente_alcadas is 'Alcada de cada acao do funcionario virtual: livre, pedir ou proibido.';
comment on table public.agente_pedidos is 'Pedidos de autorizacao abertos pelo agente e a decisao do Marco. Vence em 24 h.';
comment on table public.agente_diario  is 'Diario append-only do agente: toda mudanca de alcada, pedido, decisao e acao executada.';

-- ─────────────────────────────────────────────────────────────
-- RLS: autenticados LEEM tudo. Ninguem escreve pela chave publica, com UMA
-- excecao: a decisao do Marco em `analise_conflitos`, que e a tela de
-- conferencia. Mesmo la a permissao e por COLUNA, e nao na linha inteira:
-- ele decide o conflito, nao reescreve o que a carga mediu.
-- ─────────────────────────────────────────────────────────────
alter table public.analises            enable row level security;
alter table public.analise_exercicios  enable row level security;
alter table public.analise_documentos  enable row level security;
alter table public.analise_conflitos   enable row level security;
alter table public.agente_alcadas      enable row level security;
alter table public.agente_pedidos      enable row level security;
alter table public.agente_diario       enable row level security;

drop policy if exists "Autenticados leem" on public.analises;
create policy "Autenticados leem" on public.analises
  for select to authenticated using (true);

drop policy if exists "Autenticados leem" on public.analise_exercicios;
create policy "Autenticados leem" on public.analise_exercicios
  for select to authenticated using (true);

drop policy if exists "Autenticados leem" on public.analise_documentos;
create policy "Autenticados leem" on public.analise_documentos
  for select to authenticated using (true);

drop policy if exists "Autenticados leem" on public.analise_conflitos;
create policy "Autenticados leem" on public.analise_conflitos
  for select to authenticated using (true);

drop policy if exists "Autenticados leem" on public.agente_alcadas;
create policy "Autenticados leem" on public.agente_alcadas
  for select to authenticated using (true);

drop policy if exists "Autenticados leem" on public.agente_pedidos;
create policy "Autenticados leem" on public.agente_pedidos
  for select to authenticated using (true);

drop policy if exists "Autenticados leem" on public.agente_diario;
create policy "Autenticados leem" on public.agente_diario
  for select to authenticated using (true);

-- A tela de conferencia: ele decide o conflito. A policy libera o UPDATE, e
-- o GRANT por coluna e o que impede a tela de reescrever `valor_crm`,
-- `valor_analise` ou `motivo` (o que a carga mediu fica intacto e auditavel).
drop policy if exists "Marco decide o conflito" on public.analise_conflitos;
create policy "Marco decide o conflito" on public.analise_conflitos
  for update to authenticated using (true) with check (true);

revoke update on public.analise_conflitos from authenticated;
grant  update (situacao, decidido_por, decidido_em, observacao)
  on public.analise_conflitos to authenticated;