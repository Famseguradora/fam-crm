-- ============================================================================
--  AxiMobius — Schema de leitura `axi` + usuário Postgres somente-leitura
--
--  Regra desta integração, sem exceção: o AxiMobius LÊ o CRM e nunca escreve.
--  A garantia não é combinada nem documental, é do banco:
--    . a role `aximobius_ro` recebe GRANT SELECT e mais nada;
--    . as policies criadas para ela são FOR SELECT;
--    . `alter default privileges` garante que tabela nova nasça só-leitura.
--  Para escrever, seria preciso um novo GRANT explícito — que só um humano dá.
--
--  IMPORTANTE — o que este arquivo NÃO faz:
--  Não calcula Taxa Média, prêmio ponderado nem nenhum KPI em SQL. Essas
--  fórmulas têm fonte única em lib/corretoras/agregacoes.ts e são servidas
--  prontas por GET /api/axi/kpis. Reescrevê-las aqui criaria dois donos da
--  mesma verdade, e o dia em que divergissem o cockpit e o AxiMobius
--  mostrariam números diferentes para o mesmo mês.
-- ============================================================================

create schema if not exists axi;
comment on schema axi is 'Camada de leitura do CRM FAM para o AxiMobius. Somente views. Nenhuma escrita.';

-- ── 1. Operações desnormalizadas ────────────────────────────────────────────
-- Poupa o AxiMobius de refazer os quatro joins a cada consulta. Traz os campos
-- BRUTOS que alimentam as fórmulas (lmg, taxa, vigencia_dias, periodicidade),
-- para que ele possa recalcular o que quiser sem depender de número mastigado.
create or replace view axi.vw_operacoes as
select
  o.id,
  o.created_at,
  o.updated_at,
  o.data_entrada,
  o.data_emissao,
  o.status,
  o.prioridade,
  o.temperatura,
  o.modalidade,
  o.codigo_cobertura,
  o.estado,
  o.ativo,

  -- Números crus. O teto de R$ 80 Mi NÃO é aplicado aqui de propósito:
  -- `premio_previsto` já nasce limitado (coluna gerada), mas `lmg` é o valor
  -- real cadastrado. Quem aplica o teto é a fórmula, não o dado.
  o.lmg,
  o.taxa,
  o.vigencia_anos,
  o.vigencia_dias,
  o.periodicidade_vigencia,
  o.premio_previsto,

  -- Subscrição e Comitê: o ciclo de decisão inteiro.
  o.parecer_subscricao,
  o.voto_subscricao,
  o.subscritor_nome,
  o.comite_decisao,
  o.comite_parecer_final,
  o.comite_encerrado,
  o.comite_data,
  o.comite_vista_por,
  o.comite_variacao_taxa,
  o.comite_variacao_lmg,

  o.tomador_id,
  t.razao_social   as tomador_razao_social,
  t.nome_fantasia  as tomador_nome_fantasia,
  t.cnpj           as tomador_cnpj,
  t.porte          as tomador_porte,
  t.status         as tomador_status,
  t.limite_aprovado as tomador_limite_aprovado,
  t.cidade         as tomador_cidade,
  t.estado         as tomador_estado,

  o.corretora_id,
  c.razao_social   as corretora_razao_social,
  c.nome_fantasia  as corretora_nome_fantasia,
  c.cnpj           as corretora_cnpj,
  c.status         as corretora_status,
  c.cidade         as corretora_cidade,
  c.estado         as corretora_estado,

  o.produto_id,
  p.nome           as produto_nome,
  p.codigo         as produto_codigo
from public.operacoes o
left join public.tomadores  t on t.id = o.tomador_id
left join public.corretoras c on c.id = o.corretora_id
left join public.produtos   p on p.id = o.produto_id;

comment on view axi.vw_operacoes is
  'Operações com tomador, corretora e produto resolvidos. Valores brutos: o teto de R$ 80 Mi é da fórmula, não do dado.';

-- ── 2. Transições de status com tempo de permanência ────────────────────────
-- A view que responde à pergunta que o AxiMobius existe para fazer: quanto
-- tempo cada coisa passa em cada etapa, e para onde vai depois.
--
-- Depende de `fam_historico` (migração ...-historico.sql). `dias_no_status`
-- fica NULL na última transição — o registro ainda está lá, o relógio corre.
create or replace view axi.vw_status_transicoes as
select
  h.tabela,
  h.registro_id,
  h.valor_antes  as status_de,
  h.valor_depois as status_para,
  h.mudou_em,
  h.usuario_email as mudou_por,
  lead(h.mudou_em) over (
    partition by h.tabela, h.registro_id order by h.mudou_em
  ) as proxima_mudanca_em,
  round(
    extract(epoch from (
      lead(h.mudou_em) over (
        partition by h.tabela, h.registro_id order by h.mudou_em
      ) - h.mudou_em
    )) / 86400.0
  , 2) as dias_no_status
from public.fam_historico h
where h.campo = 'status'
  and h.acao = 'update';

comment on view axi.vw_status_transicoes is
  'Funil real: cada mudança de status com de/para e quantos dias durou. dias_no_status NULL = etapa ainda em curso.';

-- ── 3. Tomadores e corretoras com contexto ──────────────────────────────────
create or replace view axi.vw_tomadores as
select
  t.*,
  c.razao_social  as corretora_razao_social,
  c.nome_fantasia as corretora_nome_fantasia,
  c.status        as corretora_status,
  (select count(*) from public.operacoes o where o.tomador_id = t.id)  as qtd_operacoes,
  (select count(*) from public.socios s where s.tomador_id = t.id and s.ativo) as qtd_socios
from public.tomadores t
left join public.corretoras c on c.id = t.corretora_id;

create or replace view axi.vw_corretoras as
select
  c.*,
  (select count(*) from public.tomadores t where t.corretora_id = c.id) as qtd_tomadores,
  (select count(*) from public.operacoes o where o.corretora_id = c.id) as qtd_operacoes
from public.corretoras c;

-- ── 4. Linha do tempo unificada ─────────────────────────────────────────────
-- Todo evento do CRM em ordem cronológica, pronto para série temporal.
create or replace view axi.vw_linha_do_tempo as
select
  h.id,
  h.mudou_em,
  h.tabela,
  h.registro_id,
  h.acao,
  h.campo,
  h.valor_antes,
  h.valor_depois,
  h.usuario_email,
  -- Marca os campos que movem dinheiro, para filtro rápido do lado de lá.
  (h.campo in ('lmg','taxa','premio_previsto','limite_aprovado','vigencia_dias')) as afeta_valor,
  (h.campo = 'status') as e_mudanca_de_status
from public.fam_historico h;

-- ── 5. O usuário somente-leitura ────────────────────────────────────────────
-- Criada com NOLOGIN de propósito: a role já nasce com todas as permissões
-- certas, mas não consegue conectar até alguém definir a senha. Assim a
-- credencial nunca precisa existir num arquivo, num commit ou numa conversa.
--
-- Para habilitar (rode no SQL Editor do Supabase, com uma senha forte SUA):
--     alter role aximobius_ro with login password 'sua-senha-forte-aqui';
--
-- Para desligar o acesso do AxiMobius a qualquer momento:
--     alter role aximobius_ro with nologin;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'aximobius_ro') then
    create role aximobius_ro with nologin;
    raise notice 'role aximobius_ro criada (sem login ate definir senha)';
  else
    raise notice 'role aximobius_ro ja existe';
  end if;
end $$;

-- Leitura dos schemas
grant usage on schema public to aximobius_ro;
grant usage on schema axi    to aximobius_ro;

-- SELECT no que existe hoje...
grant select on all tables in schema public to aximobius_ro;
grant select on all tables in schema axi    to aximobius_ro;

-- ...e no que for criado amanhã, sem precisar lembrar de voltar aqui.
alter default privileges in schema public grant select on tables to aximobius_ro;
alter default privileges in schema axi    grant select on tables to aximobius_ro;

-- Cinto e suspensório: revoga explicitamente qualquer escrita que uma role
-- herdada (PUBLIC) pudesse ter concedido sem querer.
revoke insert, update, delete, truncate on all tables in schema public from aximobius_ro;
revoke insert, update, delete, truncate on all tables in schema axi    from aximobius_ro;
revoke create on schema public from aximobius_ro;

-- ── 6. RLS: sem policy, a role não lê nada ──────────────────────────────────
-- Todas as policies do CRM são `TO authenticated`. `aximobius_ro` não é
-- `authenticated` (não vem do Supabase Auth), então o RLS a bloquearia em
-- 100% das tabelas. Aqui ela ganha uma policy de SELECT em cada uma — e só
-- de SELECT, o que mantém a promessa de leitura mesmo que alguém erre um
-- GRANT no futuro.
do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = true
  loop
    execute format('drop policy if exists axi_ro_select on public.%I', t.tablename);
    execute format(
      'create policy axi_ro_select on public.%I for select to aximobius_ro using (true)',
      t.tablename);
  end loop;
end $$;

-- ── 6b. Catálogo de colunas para GET /api/axi/schema ────────────────────────
-- Serve o contrato lido do banco, para que ele não envelheça em relação ao
-- schema real.
create or replace function public.axi_colunas()
returns table (tabela text, coluna text, tipo text)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select c.table_name::text, c.column_name::text, c.data_type::text
  from information_schema.columns c
  where c.table_schema = 'public'
  order by c.table_name, c.ordinal_position;
$$;

-- CUIDADO: no Supabase, `revoke ... from public` NÃO basta. Os roles `anon` e
-- `authenticated` recebem EXECUTE por default privileges do projeto e precisam
-- ser revogados nominalmente. Sem isto, esta função fica chamável via
-- /rest/v1/rpc/axi_colunas com a chave pública que vai no bundle do frontend,
-- expondo a estrutura inteira do banco a quem só tem a anon key.
revoke all on function public.axi_colunas() from anon, authenticated, public;
grant execute on function public.axi_colunas() to service_role;
grant execute on function public.axi_colunas() to aximobius_ro;

revoke all on function public.fam_registra_historico() from anon, authenticated, public;

-- ── 6c. Índices do caminho quente ───────────────────────────────────────────
-- O AxiMobius chama ?desde=<timestamp> a cada poucos minutos; sem índice em
-- updated_at cada chamada varre a tabela inteira.
create index if not exists idx_operacoes_updated_at    on public.operacoes    (updated_at);
create index if not exists idx_tomadores_updated_at    on public.tomadores    (updated_at);
create index if not exists idx_corretoras_updated_at   on public.corretoras   (updated_at);
create index if not exists idx_socios_updated_at       on public.socios       (updated_at);
create index if not exists idx_comite_votos_updated_at on public.comite_votos (updated_at);
create index if not exists idx_usuarios_updated_at     on public.usuarios     (updated_at);
create index if not exists idx_audit_log_created_at    on public.audit_log    (created_at);
create index if not exists idx_audit_log_registro      on public.audit_log    (tabela, registro_id);

-- ── 7. Conferência ──────────────────────────────────────────────────────────
-- Deve retornar zero linhas. Qualquer linha aqui é um furo na promessa de
-- somente-leitura e precisa ser investigada antes de entregar a credencial.
select
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where grantee = 'aximobius_ro'
  and privilege_type <> 'SELECT';
