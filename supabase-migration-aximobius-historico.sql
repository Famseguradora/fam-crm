-- ============================================================================
--  AxiMobius — Captura de histórico no BANCO (não na tela)
--
--  Por que existe: até aqui o histórico do CRM morava em `audit_log`, gravado
--  pelo código das telas (operacoes/page.tsx, tomadores/page.tsx, ...). Isso
--  deixa três buracos que inviabilizam análise temporal séria:
--
--    1. só cobre 4 tabelas (operacoes, tomadores, socios, avisos);
--    2. só grava o que passa pela TELA — script, SQL direto e a própria API
--       escapam sem deixar rastro;
--    3. guarda o registro inteiro em jsonb, então "quantos dias a operação
--       ficou em Comitê" exige varrer e difundir JSON na mão.
--
--  `fam_historico` resolve os três: o gatilho é do BANCO (nada escapa), cobre
--  todas as tabelas de negócio, e grava UMA LINHA POR CAMPO ALTERADO — que é
--  o formato que responde "status mudou de X para Y em tal instante" com um
--  índice, sem processar JSON.
--
--  `audit_log` continua intacto e funcionando. Esta migração não o altera.
-- ============================================================================

-- ── 1. A tabela ─────────────────────────────────────────────────────────────
create table if not exists public.fam_historico (
  id            bigint generated always as identity primary key,
  tabela        text        not null,
  registro_id   uuid        not null,
  acao          text        not null check (acao in ('insert','update','delete')),

  -- Preenchidos só em UPDATE: uma linha por campo que mudou.
  campo         text,
  valor_antes   text,
  valor_depois  text,

  -- Preenchido só em INSERT (estado inicial) e DELETE (último estado).
  snapshot      jsonb,

  -- Quem fez. Nulo quando a mudança vem de service_role, script ou SQL direto.
  usuario_auth_id uuid,
  usuario_email   text,

  mudou_em      timestamptz not null default now()
);

comment on table public.fam_historico is
  'Trilha temporal completa do CRM, alimentada por trigger. Fonte do AxiMobius para análise de variação, funil e tempo em cada etapa.';
comment on column public.fam_historico.campo is
  'Nome da coluna alterada. NULL em insert/delete (ver snapshot).';
comment on column public.fam_historico.snapshot is
  'Registro inteiro. Preenchido no insert (como nasceu) e no delete (como morreu).';

-- ── 2. Índices ──────────────────────────────────────────────────────────────
-- Pensados para as três perguntas que o AxiMobius vai fazer o tempo todo.

-- "o que mudou desde a última sincronização?" (delta incremental)
create index if not exists idx_fam_hist_mudou_em
  on public.fam_historico (mudou_em);

-- "toda a vida deste registro" (linha do tempo de uma operação)
create index if not exists idx_fam_hist_registro
  on public.fam_historico (tabela, registro_id, mudou_em);

-- "todas as transições de status" (funil) — parcial, só as linhas que importam
create index if not exists idx_fam_hist_campo
  on public.fam_historico (tabela, campo, mudou_em)
  where campo is not null;

-- ── 3. A função de gatilho ──────────────────────────────────────────────────
-- SECURITY DEFINER porque precisa escrever mesmo com RLS ligado e mesmo quando
-- quem disparou não tem grant de INSERT nesta tabela (que é a regra: ninguém
-- escreve aqui à mão).
create or replace function public.fam_registra_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_antes    jsonb;
  v_depois   jsonb;
  v_chave    text;
  v_de       text;
  v_para     text;
  v_id       uuid;
  v_auth_id  uuid;
  v_email    text;
  -- Ruído: mexem em toda escrita e não dizem nada sobre o negócio.
  v_ignorar  text[] := array['updated_at','atualizado_em'];
begin
  -- auth.uid() falha fora de uma sessão PostgREST (script, SQL direto, cron).
  -- Nesses casos a autoria fica nula em vez de derrubar a escrita do usuário.
  begin
    v_auth_id := auth.uid();
  exception when others then
    v_auth_id := null;
  end;

  if v_auth_id is not null then
    select u.email into v_email from public.usuarios u where u.auth_id = v_auth_id;
  end if;

  if (TG_OP = 'INSERT') then
    v_depois := to_jsonb(NEW);
    v_id := (v_depois ->> 'id')::uuid;
    insert into public.fam_historico
      (tabela, registro_id, acao, snapshot, usuario_auth_id, usuario_email)
    values
      (TG_TABLE_NAME, v_id, 'insert', v_depois, v_auth_id, v_email);
    return NEW;
  end if;

  if (TG_OP = 'DELETE') then
    v_antes := to_jsonb(OLD);
    v_id := (v_antes ->> 'id')::uuid;
    insert into public.fam_historico
      (tabela, registro_id, acao, snapshot, usuario_auth_id, usuario_email)
    values
      (TG_TABLE_NAME, v_id, 'delete', v_antes, v_auth_id, v_email);
    return OLD;
  end if;

  -- UPDATE: uma linha por campo que realmente mudou.
  v_antes  := to_jsonb(OLD);
  v_depois := to_jsonb(NEW);
  v_id     := (v_depois ->> 'id')::uuid;

  for v_chave in select jsonb_object_keys(v_depois) loop
    if v_chave = any (v_ignorar) then
      continue;
    end if;

    v_de   := v_antes  ->> v_chave;
    v_para := v_depois ->> v_chave;

    -- `is distinct from` trata NULL como valor: null -> 'x' conta como mudança.
    if v_de is distinct from v_para then
      insert into public.fam_historico
        (tabela, registro_id, acao, campo, valor_antes, valor_depois,
         usuario_auth_id, usuario_email)
      values
        (TG_TABLE_NAME, v_id, 'update', v_chave, v_de, v_para,
         v_auth_id, v_email);
    end if;
  end loop;

  return NEW;
end;
$$;

-- ── 4. Ligar nas tabelas de negócio ─────────────────────────────────────────
-- Fora da lista de propósito: fam_historico (recursão), audit_log (já é trilha),
-- comite_convite_acessos (log de acesso, cresce sozinho) e as tabelas de
-- configuração de IA/skills, que não são dado de negócio.
do $$
declare
  t text;
  alvos text[] := array[
    'operacoes', 'tomadores', 'corretoras', 'socios',
    'comite_votos', 'comite_comentarios', 'comite_convites',
    'metas_negocio', 'produtos', 'modalidades', 'anexos',
    'usuarios', 'status_fluxo_operacao', 'status_fluxo_tomador',
    'avisos', 'configuracoes_sistema'
  ];
begin
  foreach t in array alvos loop
    -- Só liga em tabela que existe e que tenha `id` uuid (o gatilho depende disso).
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name = 'id' and data_type = 'uuid'
    ) then
      execute format('drop trigger if exists trg_fam_historico on public.%I', t);
      execute format(
        'create trigger trg_fam_historico
           after insert or update or delete on public.%I
           for each row execute function public.fam_registra_historico()', t);
      raise notice 'historico ligado em: %', t;
    else
      raise notice 'PULADO (sem id uuid): %', t;
    end if;
  end loop;
end $$;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Leitura para quem tem login no CRM. Escrita: ninguém — só o trigger, que
-- passa por cima por ser SECURITY DEFINER. Sem policy de INSERT/UPDATE/DELETE,
-- a tabela é append-only na prática.
alter table public.fam_historico enable row level security;

drop policy if exists fam_historico_select_authenticated on public.fam_historico;
create policy fam_historico_select_authenticated
  on public.fam_historico for select to authenticated using (true);

-- ── 6. Semente: o que já sabemos do passado ────────────────────────────────
-- Sem isto o AxiMobius enxergaria o mundo começando hoje. `audit_log` guarda
-- alterações desde 02/06/2026 em jsonb; aqui elas são explodidas no mesmo
-- formato campo-a-campo e marcadas com a data ORIGINAL do evento.
--
-- Idempotente: só semeia se a tabela ainda não tiver linha vinda do audit_log.
insert into public.fam_historico
  (tabela, registro_id, acao, campo, valor_antes, valor_depois,
   usuario_auth_id, usuario_email, mudou_em)
select
  a.tabela,
  a.registro_id,
  'update',
  chave,
  a.dados_antes  ->> chave,
  a.dados_depois ->> chave,
  a.usuario_auth_id,
  a.usuario_email,
  a.created_at
from public.audit_log a
cross join lateral jsonb_object_keys(a.dados_depois) as chave
where a.acao = 'alteracao'
  and a.dados_antes  is not null
  and a.dados_depois is not null
  and chave not in ('updated_at','atualizado_em')
  and (a.dados_antes ->> chave) is distinct from (a.dados_depois ->> chave)
  -- Idempotência: correlacionada pelo evento exato, para poder rodar de novo
  -- sem duplicar nada.
  and not exists (
    select 1 from public.fam_historico h
    where h.tabela = a.tabela
      and h.registro_id = a.registro_id
      and h.campo = chave
      and h.mudou_em = a.created_at
  );

-- Exclusões e criações que o audit_log registrou viram snapshot.
insert into public.fam_historico
  (tabela, registro_id, acao, snapshot, usuario_auth_id, usuario_email, mudou_em)
select
  a.tabela,
  a.registro_id,
  case when a.acao = 'exclusao' then 'delete' else 'insert' end,
  coalesce(a.dados_depois, a.dados_antes),
  a.usuario_auth_id,
  a.usuario_email,
  a.created_at
from public.audit_log a
where a.acao in ('exclusao','criacao','cadastro')
  and not exists (
    select 1 from public.fam_historico h
    where h.acao in ('insert','delete')
      and h.tabela = a.tabela
      and h.registro_id = a.registro_id
      and h.mudou_em = a.created_at
  );
