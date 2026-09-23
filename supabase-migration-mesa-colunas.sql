-- ============================================================================
--  AS COLUNAS DA MESA, criadas por ele  ·  17/09/2026
--
--  Pedido do Marco: "Dentro de Análise, tem algumas colunas com Status. Eu
--  preciso de novas colunas, baseadas em Status atuais ou novos status que eu
--  criar. Por exemplo: Interrompido. Igual o Trello, eu posso criar novas
--  colunas e, ao entrar no card, dentro do botão 'Mudar o Substatus', irá
--  aparecer uma lista com os status das colunas da Mesa."
--
--  ATÉ AQUI as cinco colunas (Entrada, Conferência, Liberado, Analisando,
--  Pronta) eram constantes no código (`FASES`, em lib/analise/esteira.ts). Não
--  havia onde guardar uma sexta. Agora elas moram nesta tabela.
--
--  DOIS TIPOS DE COLUNA, e a diferença importa:
--    · as cinco do SISTEMA têm `fase` preenchida. O card cai nelas sozinho, pela
--      régua do motor, como sempre caiu. Podem ser renomeadas e reordenadas,
--      mas não arquivadas: sem elas o card automático não teria onde cair.
--    · as dele (`fase` nula), como "Interrompido". Card só entra nelas quando
--      alguém escolhe, no botão do card.
--
--  A ESCOLHA DELE VENCE A RÉGUA. `analise_fila.coluna_id` preenchido manda o
--  card para aquela coluna e ele fica lá, mesmo que a análise ande. É o mesmo
--  princípio da `pausada`: decisão de gente vence regra automática. Para
--  devolver ao automático, o card tem a opção "Deixar o sistema decidir".
--
--  `coluna_id` É DO LADO DO CRM. A sincronização do notebook
--  (/api/esteira, `sincronizar`) só grava os campos que ela lista, e esta
--  coluna não está entre eles: o agente nunca desfaz a escolha de uma pessoa.
--
--  ROLLBACK:
--    alter table public.analise_fila drop column if exists coluna_id,
--      drop column if exists coluna_por, drop column if exists coluna_em;
--    drop table if exists public.analise_colunas;
-- ============================================================================

begin;

create table if not exists public.analise_colunas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (length(trim(titulo)) between 1 and 40),
  -- Uma das fases do motor, quando a coluna é do sistema. Nula na coluna dele.
  fase          text unique check (fase in ('entrada', 'conferencia', 'liberado', 'analisando', 'pronta')),
  dica          text,
  cor           text not null default '#8a95a3' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ordem         integer not null default 100,
  arquivada     boolean not null default false,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Coluna do sistema não se arquiva: o card automático precisa de onde cair.
  constraint analise_colunas_sistema_nao_arquiva check (fase is null or arquivada = false)
);

comment on table public.analise_colunas is
  'As colunas da Mesa (Kanban de /analises). As com fase são as cinco do sistema; as sem fase são criadas pelo analista, como Interrompido.';

alter table public.analise_fila
  add column if not exists coluna_id  uuid references public.analise_colunas(id) on delete set null,
  add column if not exists coluna_por text,
  add column if not exists coluna_em  timestamptz;

comment on column public.analise_fila.coluna_id is
  'A coluna da Mesa escolhida por uma pessoa. Vence a fase calculada pelo motor. Nula = o sistema decide pela fase.';

-- ── as cinco do sistema, com os nomes e cores que a tela já mostrava ────────
insert into public.analise_colunas (titulo, fase, dica, cor, ordem, criado_por) values
  ('Entrada',     'entrada',     'Chegou, ainda não passou pela análise documental',   '#8a95a3', 10, 'sistema'),
  ('Conferência', 'conferencia', 'Documentos lidos, falta documento ou uma decisão sua', '#a8760f', 20, 'sistema'),
  ('Liberado',    'liberado',    'Cadastro em ordem, pode analisar',                    '#2c5aa0', 30, 'sistema'),
  ('Analisando',  'analisando',  'Rodando agora',                                       '#1e4080', 40, 'sistema'),
  ('Pronta',      'pronta',      'Entregue, abrir e editar',                            '#2f7d55', 50, 'sistema')
on conflict (fase) do nothing;

-- ── quem lê e quem mexe ─────────────────────────────────────────────────────
alter table public.analise_colunas enable row level security;

drop policy if exists "Autenticados leem as colunas da Mesa" on public.analise_colunas;
create policy "Autenticados leem as colunas da Mesa" on public.analise_colunas
  for select to authenticated using (true);

-- Criar, renomear, reordenar e arquivar: quem já pode escrever no CRM, que é
-- a mesma régua de quem muda o substatus no card.
drop policy if exists "Quem escreve cria coluna na Mesa" on public.analise_colunas;
create policy "Quem escreve cria coluna na Mesa" on public.analise_colunas
  for insert to authenticated with check (fam_pode_escrever());

drop policy if exists "Quem escreve muda coluna na Mesa" on public.analise_colunas;
create policy "Quem escreve muda coluna na Mesa" on public.analise_colunas
  for update to authenticated using (fam_pode_escrever()) with check (fam_pode_escrever());

-- Não há DELETE para ninguém pela tela: coluna sai por arquivamento, e o card
-- que estava nela volta para a coluna automática (a tela ignora coluna arquivada).

-- ── ao vivo, como o resto da Mesa ───────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'analise_colunas'
  ) then
    alter publication supabase_realtime add table public.analise_colunas;
  end if;
end $$;

commit;
