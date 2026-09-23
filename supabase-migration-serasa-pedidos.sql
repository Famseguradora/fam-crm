-- ============================================================================
--  O SERASA PEDIDO PELO CADASTRO DO TOMADOR  ·  14/09/2026
--
--  Pedido do Marco: um botão "Serasa" ao lado de Receita, no cadastro do
--  tomador. Só consulta quando alguém clica (cada consulta é cobrada da FAM).
--
--  O CAMINHO DE UM CLIQUE:
--
--     tela do CRM   grava um pedido aqui ('pendente')         (é só intenção)
--     esteira       vê em GET /api/esteira/serasa e aceita    ('consultando')
--     robô          consulta no Chrome logado do notebook     (scripts/serasa.mjs)
--     esteira       sobe o PDF; a rota grava o anexo          ('pronto')
--
--  Por que uma tabela e não `analise_comandos`: aquela aceita só 'varrer' e
--  'relatorio' e não tem onde guardar CNPJ nem tomador. Um pedido do Serasa é
--  de UM tomador e termina num anexo; merece linha própria com o recibo.
--
--  QUEM ESCREVE O QUÊ: a pessoa só cria o pedido, em nome dela, e só
--  'pendente'. Estado, recibo e anexo são do servidor (service role). Não há
--  update nem delete pela sessão: pedido é registro de gasto, e gasto não some.
--
--  UM PEDIDO ABERTO POR TOMADOR: dois cliques seguidos não viram duas consultas.
--
--  ADITIVO: tabela nova, nenhuma linha existente muda.
-- ============================================================================
begin;

create table if not exists public.serasa_pedidos (
  id uuid primary key default gen_random_uuid(),
  tomador_id uuid not null references public.tomadores(id) on delete cascade,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  pedido_por text,
  pedido_por_auth_id uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  estado text not null default 'pendente'
    check (estado in ('pendente', 'consultando', 'pronto', 'reaproveitado', 'falhou')),
  aceito_em timestamptz,
  feito_em timestamptz,
  maquina text,
  resultado text,
  anexo_id uuid references public.anexos(id) on delete set null
);

comment on table public.serasa_pedidos is 'Pedidos de Serasa feitos no cadastro do tomador. A esteira do notebook consulta pelo robô (scripts/serasa.mjs) e o PDF vira anexo do tomador. Cada consulta é cobrada: não há update nem delete pela sessão.';

create index if not exists serasa_pedidos_fila on public.serasa_pedidos (estado, criado_em);
create index if not exists serasa_pedidos_tomador on public.serasa_pedidos (tomador_id, criado_em desc);
create unique index if not exists serasa_pedidos_um_aberto on public.serasa_pedidos (tomador_id)
  where estado in ('pendente', 'consultando');

alter table public.serasa_pedidos enable row level security;

drop policy if exists serasa_pedidos_leitura on public.serasa_pedidos;
create policy serasa_pedidos_leitura on public.serasa_pedidos
  for select to authenticated using (true);

drop policy if exists serasa_pedidos_pedir on public.serasa_pedidos;
create policy serasa_pedidos_pedir on public.serasa_pedidos
  for insert to authenticated
  with check (
    public.fam_pode_escrever()
    and pedido_por_auth_id = auth.uid()
    and estado = 'pendente'
    and aceito_em is null and feito_em is null and anexo_id is null and resultado is null and maquina is null
  );

commit;
