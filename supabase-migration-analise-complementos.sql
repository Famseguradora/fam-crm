-- ============================================================================
--  ANÁLISE COMPLEMENTAR  ·  17/09/2026
--
--  Pedido do Marco: o tomador já analisado manda documento novo (o balancete
--  de 2026, por exemplo). Não se refaz a análise inteira: os documentos novos
--  são lidos contra a análise anterior, e a tela mostra se a empresa manteve
--  ou mudou de rumo.
--
--  Uma linha por pedido de complemento. Quem pede é o analista (fam_e_analista),
--  quem executa é o agente do notebook (service role, pela rota
--  /api/esteira/complementos), e todo logado lê, como a própria análise.
--
--  ROLLBACK:
--    drop table if exists public.analise_complementos;
-- ============================================================================

create table if not exists public.analise_complementos (
  id              uuid primary key default gen_random_uuid(),
  analise_id      uuid not null references public.analises(id) on delete cascade,
  tomador_id      uuid references public.tomadores(id) on delete set null,
  cnpj            text,
  -- pendente -> lendo -> pronta | erro
  estado          text not null default 'pendente'
                  check (estado in ('pendente', 'lendo', 'pronta', 'erro')),
  -- O que ele quer que seja conferido (opcional).
  instrucoes      text,
  -- [{ nome, storage_path, bytes, anexo_id }]
  arquivos        jsonb not null default '[]'::jsonb,
  -- O que a IA leu, no formato de lib/analise/complemento.ts
  resultado       jsonb,
  mensagem        text,
  erro            text,
  maquina         text,
  segundos        integer,
  criado_por      uuid default auth.uid(),
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  pego_em         timestamptz,
  concluido_em    timestamptz
);

create index if not exists analise_complementos_analise_idx on public.analise_complementos (analise_id, criado_em desc);
create index if not exists analise_complementos_estado_idx on public.analise_complementos (estado) where estado in ('pendente', 'lendo');
create index if not exists analise_complementos_cnpj_idx on public.analise_complementos (cnpj);

alter table public.analise_complementos enable row level security;

drop policy if exists "Autenticados leem complementos" on public.analise_complementos;
create policy "Autenticados leem complementos" on public.analise_complementos
  for select to authenticated using (true);

drop policy if exists "So o analista pede complemento" on public.analise_complementos;
create policy "So o analista pede complemento" on public.analise_complementos
  for insert to authenticated with check (fam_e_analista());

drop policy if exists "So o analista mexe no complemento" on public.analise_complementos;
create policy "So o analista mexe no complemento" on public.analise_complementos
  for update to authenticated using (fam_e_analista()) with check (fam_e_analista());

drop policy if exists "So o analista apaga complemento" on public.analise_complementos;
create policy "So o analista apaga complemento" on public.analise_complementos
  for delete to authenticated using (fam_e_analista());

-- A tela se atualiza sozinha enquanto o notebook lê.
do $$ begin
  alter publication supabase_realtime add table public.analise_complementos;
exception when duplicate_object then null; end $$;
