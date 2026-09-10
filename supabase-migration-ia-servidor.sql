-- ============================================================================
--  A IA GESTOR EM TODO O CRM, PELA API  ·  09/09/2026
--
--  Ate aqui a IA de Gestao vivia so em /analises e so respondia pelo notebook
--  do Marco (motor 'notebook', custo zero, maquina ligada). Esta migration abre
--  o segundo motor, o 'servidor': a mesma pergunta respondida pela API da
--  Anthropic, de qualquer tela do CRM, de qualquer maquina, inclusive celular.
--
--  TRES COISAS ENTRAM, e nenhuma tabela existente perde nada:
--
--  1. `ia_config`   o liga-desliga da API, e o modelo. E TABELA e nao variavel
--                   de ambiente porque ele quer desligar sem deploy e sem
--                   mexer em arquivo. Ler e de todos (a tela precisa saber se
--                   pode perguntar); escrever e so do proprietario.
--
--  2. `ia_pedidos`  ganha o custo medido (tokens de cache separados dos
--                   normais, e o dolar da chamada). Sem isso "a API e barata"
--                   seria opiniao; com isso e numero na tela.
--
--  3. `ia_blocos`   a TABELA e o GRAFICO que a IA montar. Nao vao dentro da
--                   resposta em texto: a resposta e prosa, e o bloco e dado
--                   estruturado que a tela desenha de verdade (Recharts), com
--                   o mesmo visual do resto do CRM.
--
--  GOVERNANCA, e este e o ponto que nao se negocia:
--  a IA le o banco PELA SESSAO DE QUEM PERGUNTOU, nunca pela service role.
--  Toda a RLS que ja existe (Financeiro por lista, analise por perfil, e o
--  resto) vale igual para ela. A IA nao e um usuario com poderes: ela e o
--  proprio usuario, com pressa.
--
--  ADITIVO: nao altera tabela existente a nao ser somando coluna, nao apaga
--  nada, e roda duas vezes sem estragar.
-- ============================================================================

-- ── 1. O liga-desliga da API ────────────────────────────────────────────────
create table if not exists public.ia_config (
  id                integer primary key default 1 check (id = 1),

  -- O interruptor. Desligado, o CRM volta a perguntar so ao notebook, e a tela
  -- diz isso em vez de falhar calada.
  api_ligada        boolean not null default false,

  -- O modelo e o esforco. Trocar aqui muda o custo por pergunta sem deploy.
  --
  -- SONNET 5 E O PADRAO, decisao dele em 09/09/2026: "vamos manter o Sonnet 5;
  -- o Opus sera somente para as analises de credito e de subscricao que faremos
  -- futuramente". A IA Gestor responde pergunta de gestao sobre o proprio banco,
  -- e nisso Sonnet 5 entrega igual por cerca de 2,5x menos por token.
  -- Opus 5 fica reservado para os motores de analise, onde o custo do erro e
  -- outro: la o que esta em jogo e um limite de credito, nao um grafico.
  modelo            text not null default 'claude-sonnet-5',
  esforco           text not null default 'medium'
                    check (esforco in ('low','medium','high','xhigh','max')),

  -- Teto de gasto do dia, em dolar. Estourou, a API para sozinha e o pedido
  -- volta para o notebook. Zero significa sem teto.
  teto_diario_usd   numeric(10,2) not null default 5.00,

  -- Quem mexeu por ultimo, para o interruptor nao ser anonimo.
  mudado_por_nome   text,
  mudado_em         timestamptz not null default now()
);

comment on table public.ia_config is
  'Uma linha so (id=1): o liga-desliga da IA pela API, o modelo, o esforco e o teto de gasto diario. E tabela e nao variavel de ambiente porque desligar tem que ser um clique, sem deploy.';
comment on column public.ia_config.teto_diario_usd is
  'Teto de gasto do dia em USD, somando ia_pedidos.custo_usd das ultimas 24h. Estourou, a API recusa e o pedido cai para o notebook. 0 = sem teto.';

insert into public.ia_config (id) values (1) on conflict (id) do nothing;

-- ── 2. O custo medido, dentro do pedido ─────────────────────────────────────
-- Os tokens de cache vem SEPARADOS dos normais de proposito: e a leitura de
-- cache que faz a segunda pergunta custar um decimo da primeira, e misturar os
-- tres numeros esconderia exatamente a economia que justifica ligar a API.
alter table public.ia_pedidos add column if not exists modelo            text;
alter table public.ia_pedidos add column if not exists cache_escrita     integer;
alter table public.ia_pedidos add column if not exists cache_leitura     integer;
alter table public.ia_pedidos add column if not exists custo_usd         numeric(10,6);
alter table public.ia_pedidos add column if not exists ferramentas       integer;
-- De que tela veio a pergunta. A IA responde diferente no Funil e na ficha de
-- um tomador, e sem isto ela responderia sempre como se estivesse no acervo.
alter table public.ia_pedidos add column if not exists contexto          jsonb;

comment on column public.ia_pedidos.cache_leitura is
  'Tokens servidos do cache (cerca de 1/10 do preco do token normal). Se vier zero em perguntas seguidas, o prefixo cacheado esta sendo invalidado por alguma coisa que muda a cada chamada.';
comment on column public.ia_pedidos.custo_usd is
  'O que esta chamada custou, em dolar, ja contando cache de escrita e de leitura. Nulo no motor notebook, que e de graca.';

create index if not exists ia_pedidos_custo_idx
  on public.ia_pedidos (criado_em desc) where custo_usd is not null;

-- `escopo` passa a aceitar a IA que atende o CRM inteiro. As duas antigas
-- ('gestao' e 'analise') continuam valendo exatamente como estavam.
alter table public.ia_pedidos drop constraint if exists ia_pedidos_escopo_check;
alter table public.ia_pedidos add constraint ia_pedidos_escopo_check
  check (escopo in ('gestao', 'analise', 'crm'));

-- ── 3. As tabelas e os graficos que a IA monta ──────────────────────────────
create table if not exists public.ia_blocos (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references public.ia_pedidos(id) on delete cascade,
  ordem        integer not null default 0,

  tipo         text not null check (tipo in ('tabela','grafico')),
  titulo       text not null,
  -- Para grafico: 'barra' | 'linha' | 'pizza' | 'area'. Nulo na tabela.
  formato      text,
  -- O dado, do jeito que a tela desenha: { colunas: [...], linhas: [[...]] }
  -- na tabela; { eixo: 'nome', series: [...], dados: [...] } no grafico.
  dados        jsonb not null,
  -- De onde saiu. Grafico sem origem e grafico bonito que ninguem pode
  -- conferir, e este CRM ja teve numero assim.
  origem       text,

  criado_em    timestamptz not null default now()
);

comment on table public.ia_blocos is
  'A tabela ou o grafico que a IA montou para uma resposta. Fica fora do texto de proposito: a tela desenha de verdade (Recharts, o mesmo visual do resto do CRM) em vez de imprimir markdown.';
comment on column public.ia_blocos.origem is
  'Que consulta gerou estes numeros. Grafico sem origem e grafico que ninguem pode conferir.';

create index if not exists ia_blocos_pedido_idx on public.ia_blocos (pedido_id, ordem);

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- Leitura da config: todo mundo autenticado, porque a TELA precisa saber se
-- pode perguntar (botao que promete o que nao existe e pior que botao ausente).
-- Escrita: so proprietario. Nunca `to public`: `public` inclui `anon`, e a
-- chave publica do bundle passaria.
alter table public.ia_config enable row level security;
alter table public.ia_blocos enable row level security;

drop policy if exists ia_config_leitura on public.ia_config;
create policy ia_config_leitura on public.ia_config
  for select to authenticated using (true);

drop policy if exists ia_config_escrita on public.ia_config;
create policy ia_config_escrita on public.ia_config
  for all to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.auth_id = auth.uid() and u.proprietario = true))
  with check (exists (select 1 from public.usuarios u
                      where u.auth_id = auth.uid() and u.proprietario = true));

-- Os blocos seguem o pedido: quem pode ver a pergunta ve a tabela dela.
drop policy if exists ia_blocos_leitura on public.ia_blocos;
create policy ia_blocos_leitura on public.ia_blocos
  for select to authenticated using (true);

drop policy if exists ia_blocos_escrita on public.ia_blocos;
create policy ia_blocos_escrita on public.ia_blocos
  for all to authenticated using (fam_pode_escrever()) with check (fam_pode_escrever());

-- ── 5. O HISTORICO, POR CONVERSA E POR PESSOA ───────────────────────────────
--  Ordem dele em 09/09/2026: "a IA tem que ter o historico preservado por
--  conversa; cada usuario tem o seu historico".
--
--  NAO NASCE TABELA NOVA. `ia_conversas` e `ia_mensagens` ja existem desde
--  08/09 (o fio da IA de Gestao do notebook). A IA do CRM entra nelas com
--  `escopo = 'crm'`, e o fio fica um so: um dia essas duas IAs conversam.
--
--  A PRIVACIDADE E POR ESCOPO, e nao por tabela:
--
--    escopo 'gestao' e 'analise'   continuam VISIVEIS PARA A EQUIPE. E de
--                                  proposito e ja era assim: a analise de
--                                  credito tem um analista so e uma plateia
--                                  que acompanha. Mudar isso aqui apagaria
--                                  uma decisao que ja esta tomada.
--    escopo 'crm'                  e SO DE QUEM PERGUNTOU. Ninguem le a
--                                  conversa do outro, nem o proprietario.
--
--  Escrever numa conversa 'crm' nao exige `fam_pode_escrever()`: quem so le o
--  CRM tambem tem direito ao proprio historico com a IA. O que ele pode ver
--  continua sendo decidido pela RLS de cada tabela consultada, e nao por esta.
alter table public.ia_conversas drop constraint if exists ia_conversas_escopo_check;
alter table public.ia_conversas add constraint ia_conversas_escopo_check
  check (escopo in ('gestao', 'analise', 'crm'));

-- De que tela a conversa nasceu, para a lista dizer do que ela tratava.
alter table public.ia_conversas add column if not exists tela text;

create index if not exists ia_conversas_minhas_idx
  on public.ia_conversas (criado_por_auth_id, ultima desc) where escopo = 'crm';

drop policy if exists ia_conversas_leitura on public.ia_conversas;
create policy ia_conversas_leitura on public.ia_conversas
  for select to authenticated
  using (escopo <> 'crm' or criado_por_auth_id = auth.uid());

drop policy if exists ia_conversas_escrita on public.ia_conversas;
create policy ia_conversas_escrita on public.ia_conversas
  for all to authenticated
  using (
    case when escopo = 'crm' then criado_por_auth_id = auth.uid()
         else public.fam_pode_escrever() end
  )
  with check (
    case when escopo = 'crm' then criado_por_auth_id = auth.uid()
         else public.fam_pode_escrever() end
  );

-- A mensagem segue a conversa: quem pode ver o assunto ve as falas dele.
drop policy if exists ia_mensagens_leitura on public.ia_mensagens;
create policy ia_mensagens_leitura on public.ia_mensagens
  for select to authenticated
  using (exists (
    select 1 from public.ia_conversas c
    where c.id = conversa_id
      and (c.escopo <> 'crm' or c.criado_por_auth_id = auth.uid())
  ));

drop policy if exists ia_mensagens_escrita on public.ia_mensagens;
create policy ia_mensagens_escrita on public.ia_mensagens
  for all to authenticated
  using (exists (
    select 1 from public.ia_conversas c
    where c.id = conversa_id
      and (case when c.escopo = 'crm' then c.criado_por_auth_id = auth.uid()
                else public.fam_pode_escrever() end)
  ))
  with check (exists (
    select 1 from public.ia_conversas c
    where c.id = conversa_id
      and (case when c.escopo = 'crm' then c.criado_por_auth_id = auth.uid()
                else public.fam_pode_escrever() end)
  ));

-- O pedido tambem so pode ser visto por quem fez, quando e do CRM. Sem isto, a
-- pergunta apareceria escondida na conversa mas legivel na tabela de pedidos.
drop policy if exists ia_pedidos_leitura on public.ia_pedidos;
create policy ia_pedidos_leitura on public.ia_pedidos
  for select to authenticated
  using (escopo <> 'crm' or criado_por_auth_id = auth.uid());

drop policy if exists ia_pedidos_escrita on public.ia_pedidos;
create policy ia_pedidos_escrita on public.ia_pedidos
  for all to authenticated
  using (
    case when escopo = 'crm' then criado_por_auth_id = auth.uid()
         else public.fam_pode_escrever() end
  )
  with check (
    case when escopo = 'crm' then criado_por_auth_id = auth.uid()
         else public.fam_pode_escrever() end
  );

-- O bloco segue o pedido, pela mesma razao.
drop policy if exists ia_blocos_leitura on public.ia_blocos;
create policy ia_blocos_leitura on public.ia_blocos
  for select to authenticated
  using (exists (
    select 1 from public.ia_pedidos p
    where p.id = pedido_id
      and (p.escopo <> 'crm' or p.criado_por_auth_id = auth.uid())
  ));

drop policy if exists ia_blocos_escrita on public.ia_blocos;
create policy ia_blocos_escrita on public.ia_blocos
  for all to authenticated
  using (exists (
    select 1 from public.ia_pedidos p
    where p.id = pedido_id
      and (case when p.escopo = 'crm' then p.criado_por_auth_id = auth.uid()
                else public.fam_pode_escrever() end)
  ))
  with check (exists (
    select 1 from public.ia_pedidos p
    where p.id = pedido_id
      and (case when p.escopo = 'crm' then p.criado_por_auth_id = auth.uid()
                else public.fam_pode_escrever() end)
  ));
