-- ============================================================================
--  OS SÓCIOS DO SERASA, COM APROVAÇÃO  ·  14/09/2026
--
--  Regra do Marco: "Sempre traz a primeira camada, quando tiver sócios, aí tem
--  que pedir aprovação."
--
--  A EMPRESA (camada 'empresa') continua como já era: consulta direto, pelo
--  botão do cadastro ou pela esteira quando o Serasa falta.
--
--  OS SÓCIOS (camada 'socio') nascem do quadro societário que o robô leu no
--  relatório da empresa, e nascem PARADOS em 'aguardando_aprovacao'. Cada um é
--  uma consulta cobrada. Só quem é analista de crédito (`fam_e_analista()`, a
--  mesma trava das alçadas do agente) aprova ou dispensa, e só pela função
--  `serasa_decidir_socios`: não há update direto pela sessão.
--
--  O CASO QUE AINDA NÃO TEM TOMADOR: na esteira, o Serasa falta ANTES do
--  cadastro existir. Por isso o pedido pode morar só na `pasta` da análise, e
--  `tomador_id` deixou de ser obrigatório (um dos dois tem que existir).
--
--  `cnpj` continua sendo o CNPJ do TOMADOR (é ele que a rota confere contra o
--  cadastro). O documento consultado de verdade vai em `documento`: o próprio
--  CNPJ na camada empresa, o CPF ou CNPJ do sócio na camada sócio.
--
--  ADITIVO: as linhas existentes ficam como estão (camada 'empresa').
-- ============================================================================
begin;

alter table public.serasa_pedidos alter column tomador_id drop not null;
alter table public.serasa_pedidos add column if not exists camada text not null default 'empresa';
alter table public.serasa_pedidos add column if not exists documento text;
alter table public.serasa_pedidos add column if not exists tipo_pessoa text not null default 'PJ';
alter table public.serasa_pedidos add column if not exists nome text;
alter table public.serasa_pedidos add column if not exists participacao text;
alter table public.serasa_pedidos add column if not exists anotacoes text;
alter table public.serasa_pedidos add column if not exists origem_id uuid references public.serasa_pedidos(id) on delete cascade;
alter table public.serasa_pedidos add column if not exists pasta text;
alter table public.serasa_pedidos add column if not exists decidido_por text;
alter table public.serasa_pedidos add column if not exists decidido_em timestamptz;

update public.serasa_pedidos set documento = cnpj where documento is null;
alter table public.serasa_pedidos alter column documento set not null;

alter table public.serasa_pedidos drop constraint if exists serasa_pedidos_estado_check;
alter table public.serasa_pedidos add constraint serasa_pedidos_estado_check
  check (estado in ('aguardando_aprovacao', 'pendente', 'consultando', 'pronto', 'reaproveitado', 'falhou', 'recusado'));
alter table public.serasa_pedidos drop constraint if exists serasa_pedidos_camada_check;
alter table public.serasa_pedidos add constraint serasa_pedidos_camada_check check (camada in ('empresa', 'socio'));
alter table public.serasa_pedidos drop constraint if exists serasa_pedidos_tipo_check;
alter table public.serasa_pedidos add constraint serasa_pedidos_tipo_check check (
  (tipo_pessoa = 'PJ' and documento ~ '^[0-9]{14}$') or (tipo_pessoa = 'PF' and documento ~ '^[0-9]{11}$'));
alter table public.serasa_pedidos drop constraint if exists serasa_pedidos_destino_check;
alter table public.serasa_pedidos add constraint serasa_pedidos_destino_check check (tomador_id is not null or pasta is not null);
alter table public.serasa_pedidos drop constraint if exists serasa_pedidos_socio_check;
alter table public.serasa_pedidos add constraint serasa_pedidos_socio_check check (camada = 'empresa' or origem_id is not null);

-- Um pedido aberto por DOCUMENTO por destino: a empresa e cada sócio andam juntos,
-- mas o mesmo sócio não entra duas vezes.
drop index if exists public.serasa_pedidos_um_aberto;
create unique index if not exists serasa_pedidos_um_aberto_tomador on public.serasa_pedidos (tomador_id, documento)
  where tomador_id is not null and estado in ('aguardando_aprovacao', 'pendente', 'consultando');
create unique index if not exists serasa_pedidos_um_aberto_pasta on public.serasa_pedidos (pasta, documento)
  where tomador_id is null and estado in ('aguardando_aprovacao', 'pendente', 'consultando');
create index if not exists serasa_pedidos_pasta on public.serasa_pedidos (pasta, criado_em desc);
create index if not exists serasa_pedidos_origem on public.serasa_pedidos (origem_id);

-- A pessoa só pede a EMPRESA. Sócio só nasce pelo robô e só anda por aprovação.
drop policy if exists serasa_pedidos_pedir on public.serasa_pedidos;
create policy serasa_pedidos_pedir on public.serasa_pedidos
  for insert to authenticated
  with check (
    public.fam_pode_escrever()
    and pedido_por_auth_id = auth.uid()
    and estado = 'pendente'
    and camada = 'empresa' and origem_id is null
    and tomador_id is not null and documento = cnpj and tipo_pessoa = 'PJ'
    and aceito_em is null and feito_em is null and anexo_id is null and resultado is null and maquina is null
    and decidido_por is null and decidido_em is null
  );

-- O SÓCIO É DADO PESSOAL (CPF e nome). A leitura que era `using (true)` para a
-- tabela toda deixava qualquer login ver, inclusive as contas `leitura` de fora da
-- FAM. Achado da revisão de 14/09/2026: linha de sócio só para o analista de crédito.
drop policy if exists serasa_pedidos_leitura on public.serasa_pedidos;
create policy serasa_pedidos_leitura on public.serasa_pedidos
  for select to authenticated
  using (camada = 'empresa' or public.fam_e_analista());

create or replace function public.serasa_decidir_socios(p_ids uuid[], p_aprovar boolean)
returns integer
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_nome text; v_n integer;
begin
  if not public.fam_e_analista() then
    raise exception 'Só o analista de crédito aprova consulta de sócio no Serasa.' using errcode = '42501';
  end if;
  select coalesce(nome, email) into v_nome from public.usuarios where auth_id = auth.uid();
  update public.serasa_pedidos
     set estado = case when p_aprovar then 'pendente' else 'recusado' end,
         decidido_por = v_nome, decidido_em = now(),
         feito_em = case when p_aprovar then null else now() end,
         resultado = case when p_aprovar then null else 'Dispensado por ' || coalesce(v_nome, 'analista') || '.' end
   where id = any(p_ids) and camada = 'socio' and estado = 'aguardando_aprovacao';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.serasa_decidir_socios(uuid[], boolean) from public;
revoke all on function public.serasa_decidir_socios(uuid[], boolean) from anon;
grant execute on function public.serasa_decidir_socios(uuid[], boolean) to authenticated;

-- O BOTÃO "SERASA" NO CARD DA ANÁLISE (15/09/2026, aplicada como
-- `serasa_pedido_pela_analise`): o card pode não ter tomador ainda, então o pedido
-- da empresa pode nascer só com a pasta. A rota confere o CNPJ contra a análise.
drop policy if exists serasa_pedidos_pedir on public.serasa_pedidos;
create policy serasa_pedidos_pedir on public.serasa_pedidos
  for insert to authenticated
  with check (
    public.fam_pode_escrever()
    and pedido_por_auth_id = auth.uid()
    and estado = 'pendente'
    and camada = 'empresa' and origem_id is null
    and (tomador_id is not null or pasta is not null) and documento = cnpj and tipo_pessoa = 'PJ'
    and aceito_em is null and feito_em is null and anexo_id is null and resultado is null and maquina is null
    and decidido_por is null and decidido_em is null
  );

commit;
