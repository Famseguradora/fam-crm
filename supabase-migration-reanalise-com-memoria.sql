-- ============================================================================
--  REANÁLISE COM MEMÓRIA  ·  24/09/2026
--
--  Pedido dele, depois da NC Holding: "eu não posso toda vez que tiver que
--  reanalisar uma empresa ter esse stress. Quando eu quiser uma nova análise,
--  eu informo o motivo e, se tiver documentos novos, eu subo os documentos
--  novos e peço para rodar."
--
--  A ANÁLISE ANTERIOR JÁ ESTAVA TODA NO BANCO e nunca chegava a quem ia
--  reanalisar: o `_instrucoes.txt` levava só o texto que ele digitava. Esta
--  tabela é a TRILHA do pedido: por que ele pediu, que documentos subiu, qual
--  análise era a base, qual análise saiu no fim. É ela que permite a tela
--  responder "esta análise foi refeita em tal dia, porque..." meses depois,
--  quando a ordem na `analise_fila` já foi limpa pelo agente.
--
--  Uma linha por pedido. Quem pede é o analista (fam_e_analista), quem fecha é
--  a carga quando a análise nova é publicada, e todo logado lê.
--
--  ROLLBACK:
--    drop table if exists public.analise_reanalises;
-- ============================================================================

create table if not exists public.analise_reanalises (
  id                uuid primary key default gen_random_uuid(),
  -- A análise que estava valendo quando ele pediu a reanálise.
  analise_base_id   uuid not null references public.analises(id) on delete cascade,
  -- A análise que nasceu desta reanálise. Preenchida quando ela é publicada.
  analise_nova_id   uuid references public.analises(id) on delete set null,
  fila_id           uuid references public.analise_fila(id) on delete set null,
  tomador_id        uuid references public.tomadores(id) on delete set null,
  cnpj              text,
  pasta             text,
  -- pedida -> rodando -> concluida | cancelada
  estado            text not null default 'pedida'
                    check (estado in ('pedida', 'rodando', 'concluida', 'cancelada')),
  -- POR QUE ELE PEDIU. Obrigatório na tela, e é o texto que vai inteiro para o
  -- `_instrucoes.txt` do notebook. Sem motivo não há reanálise: foi a falta
  -- dele registrada em lugar durável que fez a NC ser refeita duas vezes.
  motivo            text not null,
  escopo            text not null default 'completa' check (escopo in ('completa', 'parcial')),
  modo              text,
  -- [{ nome, storage_path, bytes, anexo_id }] — os documentos novos do pedido.
  documentos        jsonb not null default '[]'::jsonb,
  -- O dossiê da análise anterior, exatamente como foi entregue ao analista.
  -- Guardado para a auditoria poder responder "o que ele recebeu para ler?".
  dossie            text,
  criado_por        uuid default auth.uid(),
  criado_por_nome   text,
  criado_em         timestamptz not null default now(),
  concluido_em      timestamptz
);

create index if not exists analise_reanalises_base_idx on public.analise_reanalises (analise_base_id, criado_em desc);
create index if not exists analise_reanalises_nova_idx on public.analise_reanalises (analise_nova_id) where analise_nova_id is not null;
create index if not exists analise_reanalises_cnpj_idx on public.analise_reanalises (cnpj, criado_em desc);
create index if not exists analise_reanalises_abertas_idx on public.analise_reanalises (estado) where estado in ('pedida', 'rodando');

alter table public.analise_reanalises enable row level security;

drop policy if exists "Autenticados leem reanalises" on public.analise_reanalises;
create policy "Autenticados leem reanalises" on public.analise_reanalises
  for select to authenticated using (true);

drop policy if exists "So o analista pede reanalise" on public.analise_reanalises;
create policy "So o analista pede reanalise" on public.analise_reanalises
  for insert to authenticated with check (fam_e_analista());

drop policy if exists "So o analista mexe na reanalise" on public.analise_reanalises;
create policy "So o analista mexe na reanalise" on public.analise_reanalises
  for update to authenticated using (fam_e_analista()) with check (fam_e_analista());

drop policy if exists "So o analista apaga reanalise" on public.analise_reanalises;
create policy "So o analista apaga reanalise" on public.analise_reanalises
  for delete to authenticated using (fam_e_analista());

-- A tela acompanha o pedido enquanto o notebook roda.
do $$ begin
  alter publication supabase_realtime add table public.analise_reanalises;
exception when duplicate_object then null; end $$;
