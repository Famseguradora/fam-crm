-- ============================================================================
--  A MESA DA ANÁLISE DE CRÉDITO, INTEIRA, DENTRO DO CRM  (09/09/2026)
--
--  Ordem do Marco em 08/09/2026, com a tela do Sistema de Análise na mão:
--  "utilize TODAS AS FUNCIONALIDADES do Sistema de Análise de Crédito e
--   incorpore dentro do CRM: a Mesa, os Recados, a Equipe, e o que tem dentro
--   do card do tomador".
--
--  O DESENHO NÃO MUDA: o motor continua no notebook dele, e o resultado sobe.
--  O que esta migration faz é dar ao banco do CRM as CASAS que o cockpit do
--  127.0.0.1:7311 tinha só no disco de uma máquina:
--
--     o mural de recados ........ registro/recados/recados.json  -> analise_recados
--     as notas do tomador ....... registro/notas/<chave>.json    -> analise_notas
--     o encaminhamento .......... estado/pessoas.json            -> analise_encaminhamentos
--     a lista de arquivos ....... arquivos.mjs listar()          -> analise_fila.arquivos
--     a triagem e a linha ....... visao.mjs paginas[]            -> analise_fila.cadastro / linha
--     o retrato da esteira ...... visao.mjs execucao/varredura   -> analise_estado
--     as alçadas ................ registro/alcadas/*             -> agente_alcadas / agente_pedidos / agente_diario
--
--  QUEM ESCREVE O QUÊ, a regra da esteira que continua valendo:
--    o NOTEBOOK é dono do DISCO (arquivos, triagem, linha, recados que ele
--    escreveu); o CRM é dono da DECISÃO (nota, encaminhamento, ordem, lido,
--    autorização). Cada lado só escreve o que sabe. As colunas `*_no_crm_em`
--    e `aplicado_em` são o aperto de mão entre os dois: o CRM marca, o agente
--    do notebook vê, aplica no disco e confirma.
--
--  ADITIVO. Não altera nem apaga nada do que existe; só acrescenta.
-- ============================================================================

begin;

-- ── 1. A FILA GANHA O QUE O CARD PRECISA ────────────────────────────────────
alter table public.analise_fila
  add column if not exists chave           text,
  add column if not exists fase            text,
  add column if not exists nome            text,
  add column if not exists corretora       text,
  add column if not exists produto         text,
  add column if not exists cnpj_confiavel  boolean not null default false,
  add column if not exists docs            jsonb,
  add column if not exists cadastro        jsonb,
  add column if not exists arquivos        jsonb,
  add column if not exists biblioteca      jsonb,
  add column if not exists linha           jsonb not null default '[]'::jsonb,
  add column if not exists parado_desde    timestamptz,
  add column if not exists analise_chave   text,
  add column if not exists substatus       text,
  add column if not exists substatus_por   text,
  add column if not exists substatus_em    timestamptz,
  add column if not exists instrucao       text,
  add column if not exists modo            text,
  add column if not exists ordem_dados     jsonb,
  add column if not exists arquivos_fora   text[] not null default '{}',
  add column if not exists arquivos_fora_em timestamptz,
  add column if not exists arquivada       boolean not null default false,
  add column if not exists sincronizado_em timestamptz,
  -- o que aconteceu com a última ordem dada pelo CRM ("comecei", "o motor recusou: ...")
  add column if not exists ultima_ordem_resultado text,
  add column if not exists ultima_ordem_em timestamptz;

comment on column public.analise_fila.chave is 'A chave do tomador no Sistema de Análise (CNPJ confirmado, ou o nome quando não há CNPJ). É o que amarra a ficha da esteira às notas, ao encaminhamento e à IA do card.';
comment on column public.analise_fila.fase is 'A fase da Mesa (entrada, conferencia, liberado, analisando, pronta), calculada pelo motor com a mesma régua do cockpit.';
comment on column public.analise_fila.arquivos is 'A lista de arquivos da pasta, como o arquivos.mjs devolve: classe, certeza, o que cada um atende, e se entra na análise.';
comment on column public.analise_fila.linha is 'A linha de processos do tomador (e-mail, triagem, decisões, perguntas, análise), montada pelo motor.';
comment on column public.analise_fila.arquivos_fora is 'Os arquivos que uma pessoa tirou da análise pelo CRM. O agente do notebook aplica na seleção do motor.';
comment on column public.analise_fila.instrucao is 'O que observar nesta análise, escrito no card. Vai para o _instrucoes.txt da pasta quando a ordem de analisar chega ao notebook.';

-- As ordens novas do card: reconferir a pasta, analisar mesmo assim, o
-- bibliotecário ler a pasta, e refazer com escopo.
alter table public.analise_fila drop constraint if exists analise_fila_ordem_check;
alter table public.analise_fila add constraint analise_fila_ordem_check
  check (ordem is null or ordem in ('iniciar','pausar','retomar','parar','reconferir','forcar','ler_pasta','refazer'));

create index if not exists analise_fila_chave_idx on public.analise_fila (chave) where chave is not null;

-- ── 2. O RETRATO DA ESTEIRA (quantas rodando, vagas, última varredura) ────────
create table if not exists public.analise_estado (
  id             text primary key,
  dados          jsonb not null default '{}'::jsonb,
  maquina        text,
  atualizado_em  timestamptz not null default now()
);
comment on table public.analise_estado is 'Uma linha por retrato: "esteira" (execuções, vagas, varredura), escrita pelo agente do notebook a cada sincronização. É o que enche os cinco números da Mesa.';
alter table public.analise_estado enable row level security;
drop policy if exists analise_estado_leitura on public.analise_estado;
create policy analise_estado_leitura on public.analise_estado for select to authenticated using (true);

-- ── 3. O MURAL DE RECADOS ───────────────────────────────────────────────────
create table if not exists public.analise_recados (
  id                    text primary key,
  em                    timestamptz not null,
  agente                text not null,
  titulo                text not null,
  texto                 text,
  pasta                 text,
  chave                 text,
  cnpj                  text,
  assinatura            text,
  nivel                 text not null default 'normal',
  acoes                 jsonb not null default '[]'::jsonb,
  dados                 jsonb,
  -- o que o disco diz
  lido_em               timestamptz,
  arquivado_em          timestamptz,
  -- o que uma pessoa fez no CRM, esperando o notebook confirmar
  lido_no_crm_em        timestamptz,
  lido_no_crm_por       text,
  arquivado_no_crm_em   timestamptz,
  confirmado_em         timestamptz,
  sincronizado_em       timestamptz not null default now()
);
comment on table public.analise_recados is 'O mural onde os funcionários virtuais falam com o Marco (recados.mjs), espelhado no CRM. Recado não some sozinho e não se repete: a assinatura identifica o fato.';
create index if not exists analise_recados_em_idx on public.analise_recados (em desc);
create index if not exists analise_recados_chave_idx on public.analise_recados (chave) where chave is not null;
alter table public.analise_recados enable row level security;
drop policy if exists analise_recados_leitura on public.analise_recados;
create policy analise_recados_leitura on public.analise_recados for select to authenticated using (true);
drop policy if exists analise_recados_marcar on public.analise_recados;
create policy analise_recados_marcar on public.analise_recados for update to authenticated
  using (public.fam_pode_escrever()) with check (public.fam_pode_escrever());

-- ── 4. O QUE EU SEI DESTE TOMADOR (as notas) ────────────────────────────────
create table if not exists public.analise_notas (
  id             text primary key default gen_random_uuid()::text,
  chave          text not null,
  fila_id        uuid references public.analise_fila(id) on delete set null,
  tomador_id     uuid references public.tomadores(id) on delete set null,
  cnpj           text,
  titulo         text,
  html           text not null default '',
  fixada         boolean not null default false,
  origem         text not null default 'crm' check (origem in ('crm','motor')),
  autor_nome     text,
  autor_auth_id  uuid,
  em             timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
comment on table public.analise_notas is 'As notas do tomador (notas.mjs): o que o analista sabe e não cabe em documento. Por CHAVE do tomador, e não por análise: atravessa as análises da empresa. As do motor entram com origem=motor.';
create index if not exists analise_notas_chave_idx on public.analise_notas (chave, em desc);
alter table public.analise_notas enable row level security;
drop policy if exists analise_notas_leitura on public.analise_notas;
create policy analise_notas_leitura on public.analise_notas for select to authenticated using (true);
drop policy if exists analise_notas_escrita on public.analise_notas;
create policy analise_notas_escrita on public.analise_notas for all to authenticated
  using (public.fam_pode_escrever()) with check (public.fam_pode_escrever());

-- ── 5. ENCAMINHAR ESTE CASO ─────────────────────────────────────────────────
create table if not exists public.analise_encaminhamentos (
  id             uuid primary key default gen_random_uuid(),
  fila_id        uuid references public.analise_fila(id) on delete set null,
  chave          text,
  tomador_id     uuid references public.tomadores(id) on delete set null,
  pasta          text,
  tomador        text,
  para_area      text,
  para_nome      text,
  para_auth_id   uuid,
  pedido         text not null,
  prazo          date,
  estado         text not null default 'aberto' check (estado in ('aberto','respondido','fechado')),
  resposta       text,
  respondido_em  timestamptz,
  fechado_em     timestamptz,
  de_nome        text,
  de_auth_id     uuid,
  criado_em      timestamptz not null default now()
);
comment on table public.analise_encaminhamentos is 'O encaminhamento do card (pessoas.mjs): o caso continua na mesa, e passa a aparecer como esperando alguém, com o pedido escrito e o tempo correndo. Os destinos são as áreas do card e as pessoas de `usuarios`.';
create index if not exists analise_encaminhamentos_fila_idx on public.analise_encaminhamentos (fila_id, criado_em desc);
create index if not exists analise_encaminhamentos_abertos_idx on public.analise_encaminhamentos (estado) where estado <> 'fechado';
alter table public.analise_encaminhamentos enable row level security;
drop policy if exists analise_encaminhamentos_leitura on public.analise_encaminhamentos;
create policy analise_encaminhamentos_leitura on public.analise_encaminhamentos for select to authenticated using (true);
drop policy if exists analise_encaminhamentos_escrita on public.analise_encaminhamentos;
create policy analise_encaminhamentos_escrita on public.analise_encaminhamentos for all to authenticated
  using (public.fam_pode_escrever()) with check (public.fam_pode_escrever());

-- ── 6. OS COMANDOS DA MESA (Varrer de Novo, Pedir relatório) ────────────────
create table if not exists public.analise_comandos (
  id         uuid primary key default gen_random_uuid(),
  comando    text not null check (comando in ('varrer','relatorio')),
  por        text,
  criado_em  timestamptz not null default now(),
  aceito_em  timestamptz,
  feito_em   timestamptz,
  resultado  text
);
comment on table public.analise_comandos is 'Ordens da Mesa que não são de UMA análise: varrer a pasta de novo e pedir o relatório do auditor-chefe. Intenção guardada, o agente do notebook executa.';
alter table public.analise_comandos enable row level security;
drop policy if exists analise_comandos_leitura on public.analise_comandos;
create policy analise_comandos_leitura on public.analise_comandos for select to authenticated using (true);
drop policy if exists analise_comandos_pedir on public.analise_comandos;
create policy analise_comandos_pedir on public.analise_comandos for insert to authenticated
  with check (public.fam_pode_escrever());

-- ── 7. A IA DO CARD ─────────────────────────────────────────────────────────
-- O escopo 'analise' já existia na tabela; faltava dizer de QUAL card a
-- pergunta é quando ainda não há análise no banco (o ia-card.mjs responde
-- pela pasta).
alter table public.ia_pedidos
  add column if not exists fila_id  uuid references public.analise_fila(id) on delete set null,
  add column if not exists pasta    text,
  add column if not exists chave    text;
create index if not exists ia_pedidos_fila_idx on public.ia_pedidos (fila_id, criado_em) where fila_id is not null;

-- ── 8. AS ALÇADAS ───────────────────────────────────────────────────────────
-- As três tabelas já existiam (0 linhas) esperando esta migração: o
-- alcadas.mjs foi escrito em formato de tabela por isso. O agente as enche;
-- o CRM decide (autorizar / negar / mudar a alçada) e o agente aplica.
alter table public.agente_alcadas
  add column if not exists rotulo               text,
  add column if not exists o_que_faz            text,
  add column if not exists desfaz               text,
  add column if not exists padrao               text,
  add column if not exists definido_no_crm_em   timestamptz,
  add column if not exists aplicado_em          timestamptz;
create unique index if not exists agente_alcadas_acao_uq on public.agente_alcadas (acao);
drop policy if exists agente_alcadas_definir on public.agente_alcadas;
create policy agente_alcadas_definir on public.agente_alcadas for update to authenticated
  using (public.fam_e_analista()) with check (public.fam_e_analista());

alter table public.agente_pedidos
  add column if not exists acao_rotulo       text,
  add column if not exists pasta             text,
  add column if not exists chave             text,
  add column if not exists decisao_crm       text check (decisao_crm is null or decisao_crm in ('autorizar','autorizar_sempre','negar')),
  add column if not exists decisao_crm_por   text,
  add column if not exists decisao_crm_em    timestamptz,
  add column if not exists decisao_crm_motivo text,
  add column if not exists aplicado_em       timestamptz;
create unique index if not exists agente_pedidos_id_uq on public.agente_pedidos (id);
create index if not exists agente_pedidos_abertos_idx on public.agente_pedidos (status) where status = 'aberto';
drop policy if exists agente_pedidos_decidir on public.agente_pedidos;
create policy agente_pedidos_decidir on public.agente_pedidos for update to authenticated
  using (public.fam_e_analista()) with check (public.fam_e_analista());

alter table public.agente_diario
  add column if not exists ok            boolean,
  add column if not exists chave_motor   text;
create unique index if not exists agente_diario_chave_uq on public.agente_diario (chave_motor) where chave_motor is not null;

-- ── 9. AO VIVO ──────────────────────────────────────────────────────────────
-- A Mesa, o mural e a IA do card se atualizam sozinhos. As tabelas entram na
-- publicação do Realtime só se ainda não estiverem (rodar duas vezes não quebra).
do $$
declare t text;
begin
  foreach t in array array['analise_fila','analise_recados','analise_notas','analise_encaminhamentos','analise_estado','ia_pedidos','agente_pedidos','analise_comandos'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
