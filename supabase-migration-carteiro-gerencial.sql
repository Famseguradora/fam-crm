-- ============================================================================
--  O CARTEIRO GERENCIAL · a régua versionada e a classificação de cada e-mail
--  (11/09/2026, aplicada como `carteiro_gerencial_regua_e_classificacao`)
--
--  Ordem do Marco: "crie uma tela de parâmetros, onde o usuário irá
--  parametrizar a análise dos e-mails, e quando ele precisar fazer algo fora
--  do parâmetro, ele faz individual. Repare que isso é um painel gerencial
--  operacional, antes de realizar trabalho errado."
--
--  ADITIVO. Nenhuma linha existente é tocada. Três peças:
--
--  1. `email_regua`          a régua, UMA LINHA POR VERSÃO. Não tem UPDATE nem
--                            DELETE para ninguém, nem para a service role
--                            (gatilho): versão é fotografia. O e-mail é julgado
--                            pela versão que valia quando chegou, e mudar a
--                            régua hoje não reescreve o relatório de ontem.
--                            Quem grava versão nova: só o proprietário.
--
--  2. `email_classificacao`  o que a PESSOA (e, na fase 2, a IA) disse de um
--                            e-mail: não é pedido, só crédito, operação de X,
--                            sem apetite. Uma linha por e-mail e por origem,
--                            para a decisão da pessoa nunca apagar o recibo da
--                            IA. Lê quem vê a caixa; a pessoa só escreve a
--                            própria origem ('humano'). A IA grava pelo
--                            servidor.
--
--  3. `painel_pedidos`       ganha `previa`, `anexos` e `classificado_por` NO
--                            FIM (única forma aceita pelo CREATE OR REPLACE
--                            VIEW). Continua `security_invoker`: quem não vê a
--                            caixa não vê a prévia. É o que a régua lê.
--
--  A régua lê SÓ o que já está no banco (assunto, 400 caracteres de prévia,
--  nome dos anexos). Nada novo sai da máquina de ninguém.
-- ============================================================================

-- ── 1. A régua ──────────────────────────────────────────────────────────────
create table if not exists public.email_regua (
  versao             integer primary key check (versao >= 1),
  parametros         jsonb not null check (jsonb_typeof(parametros) = 'object'),
  motivo             text not null check (length(btrim(motivo)) between 3 and 500),
  criada_por_auth_id uuid,
  criada_por_nome    text,
  criada_em          timestamptz not null default now()
);

comment on table public.email_regua is
  'A régua do Carteiro gerencial: o que é pedido, de qual modalidade, com ou sem apetite. Uma linha por VERSÃO, e versão não se edita. O e-mail é julgado pela versão vigente quando chegou. Validador e significado de cada lista: lib/email/regua.ts.';
comment on column public.email_regua.parametros is
  'As seis listas fixas: excluidas, sinonimos, termos_operacao, termos_so_credito, nao_demanda_assunto, nao_demanda_remetentes. Tipo novo passa por engenharia.';

/* A PRÓXIMA VERSÃO É A PRÓXIMA. Duas abas salvando ao mesmo tempo não podem
   gravar duas "versão 3": a segunda recebe erro e recarrega. O `criada_em` é
   do banco, e não de quem chama, porque é ele que decide qual versão julga
   qual e-mail. */
create or replace function public.email_regua_proxima()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_max integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.email_regua'));
  select coalesce(max(versao), 0) into v_max from public.email_regua;
  if NEW.versao is distinct from v_max + 1 then
    raise exception 'A régua já está na versão %. Recarregue a tela e salve de novo.', v_max
      using errcode = '40001';
  end if;
  NEW.criada_em := now();
  return NEW;
end $$;

create or replace function public.email_regua_imutavel()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  raise exception 'Versão da régua não se edita nem se apaga: grave uma versão nova.'
    using errcode = '42501';
end $$;

drop trigger if exists trg_email_regua_proxima on public.email_regua;
create trigger trg_email_regua_proxima before insert on public.email_regua
  for each row execute function public.email_regua_proxima();

drop trigger if exists trg_email_regua_imutavel on public.email_regua;
create trigger trg_email_regua_imutavel before update or delete on public.email_regua
  for each row execute function public.email_regua_imutavel();

alter table public.email_regua enable row level security;
revoke all on public.email_regua from anon;

drop policy if exists email_regua_leitura on public.email_regua;
create policy email_regua_leitura on public.email_regua
  for select to authenticated using (true);

drop policy if exists email_regua_nova_versao on public.email_regua;
create policy email_regua_nova_versao on public.email_regua
  for insert to authenticated
  with check (
    criada_por_auth_id = auth.uid()
    and exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.proprietario = true)
  );

-- ── 2. O que a pessoa (e a IA) disse de cada e-mail ─────────────────────────
create table if not exists public.email_classificacao (
  email_id                 uuid not null references public.emails_caixa(id) on delete cascade,
  origem                   text not null check (origem in ('humano', 'ia')),
  tipo                     text not null check (tipo in ('operacao', 'so_credito', 'nao_demanda', 'sem_apetite')),
  modalidade               text check (modalidade is null or length(modalidade) <= 120),
  cnpj                     text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  tomador                  text check (tomador is null or length(tomador) <= 200),
  confianca                text check (confianca is null or confianca in ('seguro', 'revisar', 'incerto')),
  motivo                   text check (motivo is null or length(motivo) <= 500),
  recibo                   jsonb check (recibo is null or jsonb_typeof(recibo) = 'array'),
  regua_versao             integer references public.email_regua(versao),
  modelo                   text,
  custo_usd                numeric(10, 6),
  classificado_por         text,
  classificado_por_auth_id uuid,
  classificado_em          timestamptz not null default now(),
  primary key (email_id, origem),
  -- "Sem apetite" dito à mão precisa dizer por quê, ou de qual modalidade.
  constraint email_classificacao_sem_apetite_explica
    check (tipo <> 'sem_apetite' or motivo is not null or modalidade is not null)
);

comment on table public.email_classificacao is
  'O que a pessoa ou a IA decidiu sobre um e-mail. Vence a régua (a pessoa vence a IA). Uma linha por e-mail e por origem: a decisão da pessoa nunca apaga o recibo da IA.';

alter table public.email_classificacao enable row level security;
revoke all on public.email_classificacao from anon;

drop policy if exists email_classificacao_leitura on public.email_classificacao;
create policy email_classificacao_leitura on public.email_classificacao
  for select to authenticated
  using (exists (select 1 from public.emails_caixa e where e.id = email_id and fam_ve_caixa(e.conta_id)));

drop policy if exists email_classificacao_humano on public.email_classificacao;
create policy email_classificacao_humano on public.email_classificacao
  for all to authenticated
  using (
    origem = 'humano' and fam_pode_escrever()
    and exists (select 1 from public.emails_caixa e where e.id = email_id and fam_ve_caixa(e.conta_id))
  )
  with check (
    origem = 'humano' and fam_pode_escrever()
    and classificado_por_auth_id = auth.uid()
    and exists (select 1 from public.emails_caixa e where e.id = email_id and fam_ve_caixa(e.conta_id))
  );

/* A TRILHA. Só a transição (de que tipo para que tipo), nunca o motivo nem o
   conteúdo: é a mesma regra de `email_fluxo_eventos`. E é essa linha que faz a
   tela de quem está olhando recarregar ao vivo. */
create or replace function public.email_classificacao_trilha()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_auth uuid;
  v_nome text;
  v_email uuid := coalesce(NEW.email_id, OLD.email_id);
  v_conta uuid;
begin
  begin
    begin v_auth := auth.uid(); exception when others then v_auth := null; end;
    if v_auth is not null then
      select u.nome into v_nome from public.usuarios u where u.auth_id = v_auth;
    end if;
    select e.conta_id into v_conta from public.emails_caixa e where e.id = v_email;
    insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
    values (
      'email', v_email, v_conta,
      'classificacao_' || coalesce(NEW.origem, OLD.origem),
      case when TG_OP = 'INSERT' then null else OLD.tipo end,
      case when TG_OP = 'DELETE' then null else NEW.tipo end,
      v_auth,
      coalesce(v_nome, case when TG_OP = 'DELETE' then OLD.classificado_por else NEW.classificado_por end)
    );
  exception when others then
    raise warning 'email_classificacao_trilha (%): %', TG_OP, sqlerrm;
  end;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;

drop trigger if exists trg_email_classificacao_trilha on public.email_classificacao;
create trigger trg_email_classificacao_trilha after insert or update or delete on public.email_classificacao
  for each row execute function public.email_classificacao_trilha();

-- ── 3. A view que a tela lê, com o que a régua precisa ──────────────────────
create or replace view public.painel_pedidos with (security_invoker = true) as
select
  e.id,
  e.conta_id,
  e.conta,
  e.assunto,
  e.de,
  e.email_de,
  e.recebido_em,
  e.anexos_uteis,
  e.estado,
  e.serve,
  e.motivo,
  e.eh_pedido,
  e.dono_auth_id,
  e.dono_nome,
  e.assumido_em,
  e.aguardando_desde,
  e.aguardando_motivo,
  e.cobrado_em,
  e.caso_id,
  c.numero        as caso_numero,
  c.etapa         as caso_etapa,
  c.criado_em     as caso_criado_em,
  c.concluido_em  as caso_concluido_em,
  c.cnpj,
  c.razao_social,
  coalesce(c.corretora_texto, co.nome_fantasia, co.razao_social) as corretora,
  f.situacao      as fila_situacao,
  coalesce(f.concluido_em_crm, f.concluido_em) as fila_concluido_em,
  greatest(
    e.recebido_em,
    e.estado_em,
    e.assumido_em,
    e.classificado_em,
    e.analisado_fora_em,
    c.criado_em,
    c.enviado_analise_em,
    f.criado_em,
    f.concluido_em_crm
  ) as ultimo_movimento,
  e.analisado_fora_em,
  e.analisado_fora_por,
  e.previa,
  e.anexos,
  e.classificado_por
from public.emails_caixa e
left join public.casos c on c.id = e.caso_id
left join public.corretoras co on co.id = c.corretora_id
left join lateral (
  select af.situacao, af.concluido_em, af.concluido_em_crm, af.criado_em
    from public.analise_fila af
   where af.caso_id = c.id
   order by af.criado_em desc
   limit 1
) f on true;

-- ── 4. A régua ao vivo: quem está olhando a ponte vê a versão nova chegar ───
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'email_regua'
  ) then
    alter publication supabase_realtime add table public.email_regua;
  end if;
end $$;

-- ── 5. A primeira régua (igual a REGUA_INICIAL, em lib/email/regua.ts) ──────
insert into public.email_regua (versao, parametros, motivo, criada_por_nome)
select 1,
  '{"excluidas":["Judicial Cível","Judicial para Execução Fiscal","Judicial Trabalhista","Judicial Depósito Recursal"],"sinonimos":[{"termo":"execução fiscal","modalidades":["Judicial para Execução Fiscal"]},{"termo":"judicial fiscal","modalidades":["Judicial para Execução Fiscal"]},{"termo":"judicial cível","modalidades":["Judicial Cível"]},{"termo":"trabalhista","modalidades":["Judicial Trabalhista"]},{"termo":"depósito recursal","modalidades":["Judicial Depósito Recursal"]},{"termo":"judicial","modalidades":["Judicial Cível","Judicial para Execução Fiscal","Judicial Trabalhista","Judicial Depósito Recursal"]},{"termo":"judiciais","modalidades":["Judicial Cível","Judicial para Execução Fiscal","Judicial Trabalhista","Judicial Depósito Recursal"]},{"termo":"permuta","modalidades":["Garantia Imobiliária"]},{"termo":"contrato de fornecimento","modalidades":["Executante - Fornecedor"]},{"termo":"licitante","modalidades":["Licitante"]},{"termo":"bid bond","modalidades":["Licitante"]},{"termo":"adiantamento","modalidades":["Adiantamento de Pagamentos"]},{"termo":"retenção","modalidades":["Retenção de Pagamentos"]},{"termo":"manutenção corretiva","modalidades":["Manutenção Corretiva"]},{"termo":"aduaneiro","modalidades":["Garantia Aduaneiro"]},{"termo":"aduaneira","modalidades":["Garantia Aduaneiro"]},{"termo":"concessão","modalidades":["Concessão"]},{"termo":"parcelamento","modalidades":["Parcelamento Administrativo Fiscal"]},{"termo":"performance","modalidades":["Executante - Construtor","Executante - Fornecedor","Executante - Prestador de Serviços"]},{"termo":"executante","modalidades":["Executante - Construtor","Executante - Fornecedor","Executante - Prestador de Serviços"]}],"termos_operacao":["cotação","cotacao","cotar","IS","importância segurada","LMG","apólice","emissão","endosso","proposta","renovação da apólice"],"termos_so_credito":["cadastro","cadastral","análise de crédito","análise cadastral","análise de tomador","análise do tomador","limite de crédito","aprovação de limite","revisão de limite","renovação de limite","rating"],"nao_demanda_assunto":[],"nao_demanda_remetentes":[]}'::jsonb,
  'Régua inicial: judicial sem apetite (exemplo do Marco em 11/09/2026) e só os sinônimos inequívocos. É ponto de partida, para revisar.',
  'Sistema (Carteiro gerencial)'
where not exists (select 1 from public.email_regua);
